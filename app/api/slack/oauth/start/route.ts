import { NextResponse } from "next/server";

export const runtime = "nodejs";

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
  // Note: no state parameter (user requested).

  // Bot scopes (no user_scope needed for this app).
  const scopes = ["commands", "chat:write", "views:write"].join(",");

  const authUrl = new URL("https://slack.com/oauth/v2/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  // Optional: if we know the team, Slack can preselect it.
  if (slackTeamIdHint) authUrl.searchParams.set("team", slackTeamIdHint);

  return NextResponse.redirect(authUrl.toString(), 302);
}

