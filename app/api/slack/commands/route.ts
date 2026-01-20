import { NextResponse } from "next/server";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../../convex/_generated/api";
import { parseKeyValueArgs } from "../../../../lib/parseArgs";
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
      const config = await convex.query(api.userConfig.getUserConfig, { slackTeamId, slackUserId });
      if (!config) return slackText("Run /notionsetup first.");

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

