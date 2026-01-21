import { NextResponse } from "next/server";

export const runtime = "nodejs";

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (!state) {
    return new NextResponse("Missing state.", { status: 400 });
  }

  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  if (!clientId) {
    return new NextResponse("Missing NOTION_OAUTH_CLIENT_ID.", { status: 500 });
  }

  const redirectUri = getRedirectUri();

  const authUrl = new URL("https://api.notion.com/v1/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("owner", "user");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString(), 302);
}

