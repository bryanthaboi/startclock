import { NextResponse } from "next/server";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../../convex/_generated/api";
import { parseKeyValueArgs } from "../../../../lib/parseArgs";
import { slackApi } from "../../../../lib/slackApi";
import { verifySlackRequest } from "../../../../lib/slackVerify";
import { formatUtcIso, roundUpMinutesToHalfHour, utcDateFromMs } from "../../../../lib/time";

export const runtime = "nodejs";

function slackText(text: string, status = 200) {
  // Returning JSON is the most compatible Slack response format.
  return NextResponse.json({ response_type: "ephemeral", text }, { status });
}

function getConvexClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL / CONVEX_URL.");
  return new ConvexHttpClient(url);
}

function minutesToHhMm(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${m}m`;
}

function minutesToHoursText(minutes: number): string {
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
}

function httpText(text: string, status = 200) {
  return new NextResponse(text, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });
}

function getSiteUrlFromRequest(request: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (env) return env.replace(/\/+$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function buildSetupModal(opts: {
  siteUrl: string;
  sessionId: string;
  slackTeamId: string;
  slackUserId: string;
  channelId?: string;
}) {
  const private_metadata = JSON.stringify({
    step: "connect",
    sessionId: opts.sessionId,
    slackTeamId: opts.slackTeamId,
    slackUserId: opts.slackUserId,
    channelId: opts.channelId ?? null
  });

  const connectUrl = new URL("/api/notion/oauth/start", opts.siteUrl);
  connectUrl.searchParams.set("state", opts.sessionId);

  return {
    type: "modal",
    callback_id: "startclock_setup",
    title: { type: "plain_text", text: "Startclock setup" },
    submit: { type: "plain_text", text: "Continue" },
    close: { type: "plain_text", text: "Close" },
    private_metadata,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            "*Step 1 — Connect Notion*\n\nClick *Connect Notion* to authorize access, then come back here and click *Continue*."
        }
      },
      {
        type: "actions",
        block_id: "connect_block",
        elements: [
          {
            type: "button",
            action_id: "connect_notion",
            text: { type: "plain_text", text: "Connect Notion" },
            url: connectUrl.toString()
          }
        ]
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text:
              "Prefer not to use Notion? You can switch to *Manual mode* in the last step and copy/paste your time entry."
          }
        ]
      }
    ]
  };
}

function buildSlackInstallUrl(opts: {
  siteUrl: string;
  slackTeamId: string;
  slackUserId: string;
  channelId?: string;
}) {
  const u = new URL("/api/slack/oauth/start", opts.siteUrl);
  u.searchParams.set("team_id", opts.slackTeamId);
  u.searchParams.set("user_id", opts.slackUserId);
  if (opts.channelId) u.searchParams.set("channel_id", opts.channelId);
  return u.toString();
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const verified = verifySlackRequest({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    timestampHeader: request.headers.get("x-slack-request-timestamp"),
    signatureHeader: request.headers.get("x-slack-signature"),
    rawBody
  });
  if (!verified.ok) {
    // Slack expects a response body; keep it simple.
    return httpText(verified.message, verified.status);
  }

  // Slack slash commands are application/x-www-form-urlencoded.
  const params = new URLSearchParams(rawBody);
  const command = (params.get("command") ?? "").trim();
  const text = (params.get("text") ?? "").trim();
  const slackTeamId = params.get("team_id") ?? "";
  const slackUserId = params.get("user_id") ?? "";
  const channelId = params.get("channel_id") ?? undefined;
  const triggerId = params.get("trigger_id") ?? undefined;

  if (!command || !slackTeamId || !slackUserId) {
    return slackText("Invalid Slack command payload.", 400);
  }

  const convex = getConvexClient();

  try {
    if (command === "/notionsetup") {
      const kv = parseKeyValueArgs(text);
      const token = kv.token;
      const db = kv.db;
      const date = kv.date;
      const hours = kv.hours;
      const note = kv.note;

      if (!token || !db || !date || !hours) {
        return slackText(
          'Usage: /notionsetup token=... db=... date="Date" hours="Hours" [note="Note"]',
          200
        );
      }

      const res = await convex.action(api.notion.validateAndStoreNotionConfig, {
        slackTeamId,
        slackUserId,
        notionToken: token,
        notionDatabaseId: db,
        datePropertyName: date,
        hoursPropertyName: hours,
        notePropertyName: note
      });

      return slackText(
        `Connected. Database set.\nDate→${date}\nHours→${hours}\nNote→${note ?? "(none)"}`
      );
    }

    if (command === "/startclock") {
      if (text.trim().toLowerCase().startsWith("setup")) {
        if (!triggerId) return slackText("Slack did not include trigger_id; cannot open modal.", 400);
        const siteUrl = getSiteUrlFromRequest(request);

        const installation = await convex.query(api.slackInstallations.getInstallationByTeam, {
          slackTeamId
        });
        if (!installation) {
          const installUrl = buildSlackInstallUrl({
            siteUrl,
            slackTeamId,
            slackUserId,
            channelId
          });
          return slackText(
            `Startclock isn’t installed in this workspace yet.\nInstall: ${installUrl}\nThen run /startclock setup again.`
          );
        }

        const session = await convex.mutation(api.setupSessions.createSetupSession, {
          slackTeamId,
          slackUserId
        });
        await slackApi(installation.botAccessToken, "views.open", {
          trigger_id: triggerId,
          view: buildSetupModal({
            siteUrl,
            sessionId: session.id,
            slackTeamId,
            slackUserId,
            channelId
          })
        });
        return slackText("Opening setup…", 200);
      }

      const existing = await convex.query(api.timers.getActiveTimer, { slackTeamId, slackUserId });
      if (existing) {
        const elapsedMinutes = (Date.now() - existing.startedAtMs) / 60000;
        const { roundedMinutes, hours } = roundUpMinutesToHalfHour(elapsedMinutes);
        return slackText(
          `Already running since ${formatUtcIso(existing.startedAtMs)}.\nElapsed: ${minutesToHhMm(
            elapsedMinutes
          )} → rounds to ${hours.toFixed(1)}h right now.\nUse /stopclock or /cancelclock.`
        );
      }

      const nowMs = Date.now();
      const expiresAtMs = nowMs + 24 * 60 * 60 * 1000;
      const note = text.length > 0 ? text : undefined;

      await convex.mutation(api.timers.createTimer, {
        slackTeamId,
        slackUserId,
        startedAtMs: nowMs,
        expiresAtMs,
        note,
        channelId
      });

      return slackText(`Started. Auto-cancels in 24h.\nStartedAt: ${formatUtcIso(nowMs)}`);
    }

    if (command === "/stopclock") {
      const timer = await convex.query(api.timers.getActiveTimer, { slackTeamId, slackUserId });
      if (!timer) return slackText("No active timer.");

      const elapsedMinutes = (Date.now() - timer.startedAtMs) / 60000;
      const { roundedMinutes, hours } = roundUpMinutesToHalfHour(elapsedMinutes);
      const dateStr = utcDateFromMs(timer.startedAtMs);

      const status = await convex.query(api.userConfig.getUserConfigStatus, { slackTeamId, slackUserId });
      if (status.mode === "notion" && status.hasNotionConfig) {
        const res = await convex.action(api.notion.writeNotionEntryAndStopTimer, {
          slackTeamId,
          slackUserId
        });

        const link = res.url ? `\nNotion: ${res.url}` : "";
        return slackText(
          `Stopped.\nStart: ${formatUtcIso(timer.startedAtMs)} (UTC date ${dateStr})\nRaw: ${minutesToHhMm(
            elapsedMinutes
          )}\nRounded: ${minutesToHoursText(roundedMinutes)} (${hours.toFixed(1)} hours)\n${link}`.trim()
        );
      }

      // Manual/no-Notion path: stop timer and provide copy/paste summary.
      await convex.mutation(api.timers.deleteTimer, { slackTeamId, slackUserId });
      const note = timer.note?.trim() ? `\nNote: ${timer.note?.trim()}` : "";
      const setupHint =
        status.mode === "notion"
          ? "\n\nNotion isn’t configured yet. Run `/startclock setup` to connect and map your database."
          : "";
      return slackText(
        `Stopped (manual).\nDate: ${dateStr}\nHours: ${hours.toFixed(1)}\nRounded: ${minutesToHoursText(
          roundedMinutes
        )}${note}${setupHint}`.trim()
      );
    }

    if (command === "/statusclock") {
      const timer = await convex.query(api.timers.getActiveTimer, { slackTeamId, slackUserId });
      if (!timer) return slackText("No active timer.");

      const elapsedMinutes = (Date.now() - timer.startedAtMs) / 60000;
      const { roundedMinutes, hours } = roundUpMinutesToHalfHour(elapsedMinutes);
      return slackText(
        `Running.\nStart: ${formatUtcIso(timer.startedAtMs)}\nElapsed: ${minutesToHhMm(
          elapsedMinutes
        )}\nWould round to: ${minutesToHoursText(roundedMinutes)} (${hours.toFixed(
          1
        )} hours)\nExpires: ${formatUtcIso(timer.expiresAtMs)}`
      );
    }

    if (command === "/cancelclock") {
      const res = await convex.mutation(api.timers.deleteTimer, { slackTeamId, slackUserId });
      return slackText(res.deleted ? "Cancelled." : "No active timer.");
    }

    return slackText(`Unknown command: ${command}`, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return slackText(`Error: ${message}`, 200);
  }
}

