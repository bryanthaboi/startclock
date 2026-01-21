import { NextResponse } from "next/server";

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

export const runtime = "nodejs";

function getConvexClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL / CONVEX_URL.");
  return new ConvexHttpClient(url);
}

function getSiteUrlFromRequest(request: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (env) return env.replace(/\/+$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function getSlackRedirectUri(siteUrl: string): string {
  const explicit = process.env.SLACK_REDIRECT_URI;
  if (explicit) return explicit;
  return new URL("/api/slack/oauth/callback", siteUrl).toString();
}

type SlackOauthAccessResponse = {
  ok: boolean;
  error?: string;
  access_token?: string;
  bot_user_id?: string;
  team?: { id?: string; name?: string };
};

async function slackApiWithForm(
  method: string,
  body: Record<string, string>
): Promise<SlackOauthAccessResponse> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: new URLSearchParams(body).toString()
  });
  const json = (await res.json().catch(() => null)) as SlackOauthAccessResponse | null;
  if (!res.ok || !json) {
    throw new Error(`Slack ${method} failed (HTTP ${res.status}).`);
  }
  return json;
}

async function postEphemeral(opts: { token: string; channel: string; user: string; text: string }) {
  await fetch("https://slack.com/api/chat.postEphemeral", {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.token}`,
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({ channel: opts.channel, user: opts.user, text: opts.text })
  }).catch(() => {});
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";

  if (!code) return new NextResponse("Missing code.", { status: 400 });

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new NextResponse("Missing SLACK_CLIENT_ID/SLACK_CLIENT_SECRET.", { status: 500 });
  }

  const siteUrl = getSiteUrlFromRequest(request);
  const redirectUri = getSlackRedirectUri(siteUrl);

  const convex = getConvexClient();
  // Note: state is optional. If it is present (non-empty), we validate it.
  // If absent/empty, proceed without CSRF protection (user requested).
  const consumed =
    state.trim().length > 0
      ? await convex.mutation(api.slackOauthStates.consumeState, { state })
      : null;
  if (consumed && !consumed.ok) return new NextResponse("Invalid or already-used state.", { status: 400 });
  if (consumed?.ok) {
    // Slack auth codes expire quickly; also enforce our own short window.
    const ageMs = Date.now() - consumed.value.createdAtMs;
    if (ageMs > 10 * 60 * 1000) {
      return new NextResponse("State expired. Please try again.", { status: 400 });
    }
  }

  const tokenRes = await slackApiWithForm("oauth.v2.access", {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri
  });

  if (!tokenRes.ok || !tokenRes.access_token) {
    return new NextResponse(`Slack install failed: ${tokenRes.error ?? "unknown_error"}`, {
      status: 400
    });
  }

  const slackTeamId = tokenRes.team?.id;
  if (!slackTeamId) {
    return new NextResponse("Slack install response missing team id.", { status: 400 });
  }

  await convex.mutation(api.slackInstallations.upsertInstallation, {
    slackTeamId,
    botAccessToken: tokenRes.access_token,
    botUserId: tokenRes.bot_user_id
  });

  // If install was kicked off by a slash command, try to confirm back in Slack.
  if (consumed?.ok && consumed.value.channelIdHint && consumed.value.slackUserIdHint) {
    await postEphemeral({
      token: tokenRes.access_token,
      channel: consumed.value.channelIdHint,
      user: consumed.value.slackUserIdHint,
      text: "Startclock is installed. You can now run `/startclock setup` to connect Notion."
    });
  }

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Slack connected</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; }
    </style>
  </head>
  <body>
    <h1>Slack connected</h1>
    <p>You can close this tab and return to Slack.</p>
    <p>Next: run <strong>/startclock setup</strong> to connect Notion and map your database.</p>
  </body>
</html>`;

  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

