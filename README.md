# startclock

Slack slash commands → Vercel (Next.js API route) → Convex (DB + logic + scheduler) → Notion (on `/stopclock`).

## Slash commands (MVP)

- `/notionsetup token=... db=... date=... hours=... note=...`
- `/startclock [optional note]`
- `/stopclock`
- `/statusclock`
- `/cancelclock`

## Environment variables

Set these in Vercel (and locally via `.env.local`).

- `SLACK_SIGNING_SECRET`: Slack signing secret for request verification.
- `NEXT_PUBLIC_CONVEX_URL` (or `CONVEX_URL`): Convex deployment URL.

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

- `https://<your-vercel-domain>/api/slack/commands`

## Notion setup

Create a Notion integration, copy its **Internal Integration Token**, and share your target database with that integration.

Then run:

```text
/notionsetup token=... db=... date="Date" hours="Hours" note="Note"
```

Notes:
- The `date`, `hours`, and `note` args are **Notion property names** in your database.
- The app stores and uses **Notion property IDs** internally (stable if you rename properties).

