# startclock

Slack slash commands → Vercel (Next.js API route) → Convex (DB + logic + scheduler) → Notion (on `/stopclock`).

## Slash commands

- `/startclock setup` (opens Slack setup modal)
- `/startclock [optional note]`
- `/stopclock`
- `/statusclock`
- `/cancelclock`

## Environment variables

Set these in Vercel (and locally via `.env.local`).

- `SLACK_SIGNING_SECRET`: Slack signing secret for request verification.
- `SLACK_BOT_TOKEN`: Slack bot token (required for modals + ephemeral confirmation messages).
- `NEXT_PUBLIC_CONVEX_URL` (or `CONVEX_URL`): Convex deployment URL.
- `NEXT_PUBLIC_SITE_URL` (or `SITE_URL`): Public base URL (used to build OAuth redirect URLs).
- `NOTION_OAUTH_CLIENT_ID`: Notion OAuth client id.
- `NOTION_OAUTH_CLIENT_SECRET`: Notion OAuth client secret.
- `NOTION_OAUTH_REDIRECT_URI`: Redirect URL (optional if `NEXT_PUBLIC_SITE_URL` is set; defaults to `/api/notion/oauth/callback`).

Convex local dev will write `CONVEX_DEPLOYMENT` + `NEXT_PUBLIC_CONVEX_URL` into `.env.local`.

## Local dev

Install deps:

```bash
npm install
```

Start Convex (one-time bootstrap):

```bash
npx convex dev --once
```

Run Next.js:

```bash
npm run dev
```

## Slack setup

Create a Slack Slash Command for each command name and point all of them to:

- `https://startclock.vercel.app/api/slack/commands`

Also enable **Interactivity** and set the Request URL to:

- `https://startclock.vercel.app/api/slack/interactivity`

Required Slack OAuth scopes (typical):

- `commands`
- `chat:write`
- `views:write`

## Notion setup (recommended: OAuth)

- Create a Notion OAuth integration and set redirect URI to:
  - `https://startclock.vercel.app/api/notion/oauth/callback`
- In Slack run:

```text
/startclock setup
```

Then follow the modal steps:

- Connect Notion
- Choose a database
- Map columns (Date / Hours / Note)
- Optionally select **Manual mode** (no Notion writes; `/stopclock` returns copy/paste output)

## Notion setup (legacy token mode)

Create a Notion integration, copy its **Internal Integration Token**, and share your target database with that integration.

Then run:

```text
/notionsetup token=... db=... date="Date" hours="Hours" note="Note"
```

Notes:

- The `date`, `hours`, and `note` args are **Notion property names** in your database.
- The app stores and uses **Notion property IDs** internally (stable if you rename properties).
