import { NextResponse } from "next/server";

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const runtime = "nodejs";

function getConvexClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL / CONVEX_URL.");
  return new ConvexHttpClient(url);
}

function getRedirectUri(): string {
  const explicit = process.env.NOTION_OAUTH_REDIRECT_URI;
  if (explicit) return explicit;

  const site = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (!site) {
    throw new Error(
      "Missing NOTION_OAUTH_REDIRECT_URI (or NEXT_PUBLIC_SITE_URL/SITE_URL to derive it)."
    );
  }
  return new URL("/api/notion/oauth/callback", site).toString();
}

type NotionTokenResponse = {
  access_token: string;
  workspace_id?: string;
  workspace_name?: string;
  workspace_icon?: string | null;
  bot_id?: string;
  duplicated_template_id?: string | null;
  owner?: unknown;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return new NextResponse("Missing code/state.", { status: 400 });
  }

  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new NextResponse("Missing NOTION_OAUTH_CLIENT_ID/NOTION_OAUTH_CLIENT_SECRET.", {
      status: 500
    });
  }

  const redirectUri = getRedirectUri();
  const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");

  const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    return new NextResponse(`Notion token exchange failed (HTTP ${tokenRes.status}).\n${body}`, {
      status: 400
    });
  }

  const tokenJson = (await tokenRes.json()) as NotionTokenResponse;
  if (!tokenJson.access_token) {
    return new NextResponse("Notion token exchange returned no access_token.", { status: 400 });
  }

  const convex = getConvexClient();
  await convex.mutation(api.setupSessions.attachNotionToSetupSession, {
    id: state as Id<"setupSessions">,
    notionAccessToken: tokenJson.access_token,
    notionWorkspaceId: tokenJson.workspace_id
  });

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Notion connected</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; }
      code { background: #f6f8fa; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <h1>Notion connected</h1>
    <p>You can close this tab and return to Slack.</p>
    <p>Back in Slack, click <strong>Continue</strong> in the setup modal.</p>
  </body>
</html>`;

  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

