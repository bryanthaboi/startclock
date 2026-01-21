import crypto from "crypto";
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

export async function GET(request: Request) {
  const url = new URL(request.url);

  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) return new NextResponse("Missing SLACK_CLIENT_ID.", { status: 500 });

  const siteUrl = getSiteUrlFromRequest(request);
  const redirectUri = getSlackRedirectUri(siteUrl);

  const slackTeamIdHint = url.searchParams.get("team_id") ?? undefined;
  const slackUserIdHint = url.searchParams.get("user_id") ?? undefined;
  const channelIdHint = url.searchParams.get("channel_id") ?? undefined;

  const state = crypto.randomBytes(24).toString("hex");
  const convex = getConvexClient();
  await convex.mutation(api.slackOauthStates.createState, {
    state,
    slackTeamIdHint,
    slackUserIdHint,
    channelIdHint
  });

  // Bot scopes (no user_scope needed for this app).
  const scopes = ["commands", "chat:write", "views:write"].join(",");

  const authUrl = new URL("https://slack.com/oauth/v2/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  // Optional: if we know the team, Slack can preselect it.
  if (slackTeamIdHint) authUrl.searchParams.set("team", slackTeamIdHint);

  return NextResponse.redirect(authUrl.toString(), 302);
}

