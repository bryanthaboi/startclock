import { NextResponse } from "next/server";

import { ConvexHttpClient } from "convex/browser";

import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { slackApi } from "../../../../lib/slackApi";
import { verifySlackRequest } from "../../../../lib/slackVerify";

export const runtime = "nodejs";

function httpText(text: string, status = 200) {
  return new NextResponse(text, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });
}

type SlackInteractivePayload =
  | {
      type: "block_actions";
      user: { id: string };
      team: { id: string };
      actions: Array<{ action_id: string }>;
      view?: { id: string; hash?: string; private_metadata?: string; state?: { values: unknown } };
    }
  | {
      type: "view_submission";
      user: { id: string };
      team: { id: string };
      view: { id: string; hash?: string; private_metadata?: string; state: { values: unknown } };
    }
  | { type: string };

type SlackViewSubmissionPayload = Extract<SlackInteractivePayload, { type: "view_submission" }>;
type SlackBlockActionsPayload = Extract<SlackInteractivePayload, { type: "block_actions" }>;

function isViewSubmissionPayload(p: SlackInteractivePayload): p is SlackViewSubmissionPayload {
  return (
    (p as { type?: unknown }).type === "view_submission" &&
    typeof (p as { view?: unknown }).view === "object" &&
    (p as { view?: { state?: unknown } }).view?.state !== undefined
  );
}

function isBlockActionsPayload(p: SlackInteractivePayload): p is SlackBlockActionsPayload {
  return (p as { type?: unknown }).type === "block_actions";
}

function getConvexClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL / CONVEX_URL.");
  return new ConvexHttpClient(url);
}

type SetupPrivateMetadata =
  | {
      step: "connect";
      sessionId: string;
      slackTeamId: string;
      slackUserId: string;
      channelId: string | null;
    }
  | {
      step: "db";
      sessionId: string;
      slackTeamId: string;
      slackUserId: string;
      channelId: string | null;
    }
  | {
      step: "map";
      sessionId: string;
      slackTeamId: string;
      slackUserId: string;
      channelId: string | null;
      databaseId: string;
      titlePropertyId?: string;
    };

function parsePrivateMetadata(raw: string | undefined): SetupPrivateMetadata | null {
  if (!raw) return null;
  try {
    const json = JSON.parse(raw) as SetupPrivateMetadata;
    if (!json || typeof json !== "object") return null;
    return json;
  } catch {
    return null;
  }
}

type SlackViewStateValues = Record<string, Record<string, unknown>>;

function getSelectedValue(
  values: unknown,
  blockId: string,
  actionId: string
): string | undefined {
  const v = values as SlackViewStateValues | undefined;
  const action = v?.[blockId]?.[actionId] as
    | { selected_option?: { value?: string }; selected_radio_option?: { value?: string } }
    | undefined;
  return action?.selected_option?.value ?? action?.selected_radio_option?.value;
}

function buildDbSelectView(opts: {
  sessionId: string;
  slackTeamId: string;
  slackUserId: string;
  channelId: string | null;
  databases: Array<{ id: string; title: string }>;
}) {
  const private_metadata = JSON.stringify({
    step: "db",
    sessionId: opts.sessionId,
    slackTeamId: opts.slackTeamId,
    slackUserId: opts.slackUserId,
    channelId: opts.channelId
  } satisfies SetupPrivateMetadata);

  const options = opts.databases.slice(0, 100).map((db) => ({
    text: { type: "plain_text", text: db.title.slice(0, 75) },
    value: db.id
  }));

  return {
    type: "modal",
    callback_id: "startclock_setup",
    title: { type: "plain_text", text: "Startclock setup" },
    submit: { type: "plain_text", text: "Next" },
    close: { type: "plain_text", text: "Close" },
    private_metadata,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Step 2 — Choose your Notion database*" }
      },
      {
        type: "input",
        block_id: "db_block",
        label: { type: "plain_text", text: "Database" },
        element: {
          type: "static_select",
          action_id: "db_action",
          placeholder: { type: "plain_text", text: "Select a database" },
          options
        }
      }
    ]
  };
}

function getSiteUrlFromRequest(request: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (env) return env.replace(/\/+$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function buildConnectView(opts: {
  siteUrl: string;
  sessionId: string;
  slackTeamId: string;
  slackUserId: string;
  channelId: string | null;
  warning?: string;
}) {
  const private_metadata = JSON.stringify({
    step: "connect",
    sessionId: opts.sessionId,
    slackTeamId: opts.slackTeamId,
    slackUserId: opts.slackUserId,
    channelId: opts.channelId
  } satisfies SetupPrivateMetadata);

  const connectUrl = new URL("/api/notion/oauth/start", opts.siteUrl);
  connectUrl.searchParams.set("state", opts.sessionId);

  const warningBlock = opts.warning
    ? [
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Warning:* ${opts.warning}` }
        }
      ]
    : [];

  return {
    type: "modal",
    callback_id: "startclock_setup",
    title: { type: "plain_text", text: "Startclock setup" },
    submit: { type: "plain_text", text: "Continue" },
    close: { type: "plain_text", text: "Close" },
    private_metadata,
    blocks: [
      ...warningBlock,
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
      }
    ]
  };
}

function buildMappingView(opts: {
  sessionId: string;
  slackTeamId: string;
  slackUserId: string;
  channelId: string | null;
  databaseId: string;
  titlePropertyId?: string;
  properties: Array<{ name: string; id: string; type: string }>;
}) {
  const private_metadata = JSON.stringify({
    step: "map",
    sessionId: opts.sessionId,
    slackTeamId: opts.slackTeamId,
    slackUserId: opts.slackUserId,
    channelId: opts.channelId,
    databaseId: opts.databaseId,
    titlePropertyId: opts.titlePropertyId
  } satisfies SetupPrivateMetadata);

  const mkOptions = (pred: (p: { type: string }) => boolean) =>
    opts.properties
      .filter((p) => pred(p))
      .slice(0, 100)
      .map((p) => ({
        text: { type: "plain_text", text: p.name.slice(0, 75) },
        value: p.id
      }));

  const dateOptions = mkOptions((p) => p.type === "date");
  const hoursOptions = mkOptions((p) => p.type === "number");
  const noteOptions = mkOptions((p) => p.type === "rich_text");

  return {
    type: "modal",
    callback_id: "startclock_setup",
    title: { type: "plain_text", text: "Startclock setup" },
    submit: { type: "plain_text", text: "Save" },
    close: { type: "plain_text", text: "Close" },
    private_metadata,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: "*Step 3 — Map your columns*" } },
      {
        type: "input",
        block_id: "date_block",
        label: { type: "plain_text", text: "Date column" },
        element: {
          type: "static_select",
          action_id: "date_action",
          placeholder: { type: "plain_text", text: "Select a Date property" },
          options: dateOptions
        }
      },
      {
        type: "input",
        block_id: "hours_block",
        label: { type: "plain_text", text: "Hours column" },
        element: {
          type: "static_select",
          action_id: "hours_action",
          placeholder: { type: "plain_text", text: "Select a Number property" },
          options: hoursOptions
        }
      },
      {
        type: "input",
        block_id: "note_block",
        optional: true,
        label: { type: "plain_text", text: "Note column (optional)" },
        element: {
          type: "static_select",
          action_id: "note_action",
          placeholder: { type: "plain_text", text: "Select a Rich text property" },
          options: noteOptions
        }
      },
      {
        type: "input",
        block_id: "mode_block",
        label: { type: "plain_text", text: "Mode" },
        element: {
          type: "radio_buttons",
          action_id: "mode_action",
          options: [
            { text: { type: "plain_text", text: "Write to Notion" }, value: "notion" },
            { text: { type: "plain_text", text: "Manual (no Notion)" }, value: "manual" }
          ],
          initial_option: { text: { type: "plain_text", text: "Write to Notion" }, value: "notion" }
        }
      }
    ]
  };
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
    return httpText(verified.message, verified.status);
  }

  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get("payload");
  if (!payloadStr) return httpText("Missing payload.", 400);

  let payload: SlackInteractivePayload;
  try {
    payload = JSON.parse(payloadStr) as SlackInteractivePayload;
  } catch {
    return httpText("Invalid payload JSON.", 400);
  }

  // Note: The rest of the flow (modal updates, Notion OAuth continuation, mapping submission)
  if (isViewSubmissionPayload(payload)) {
    const meta = parsePrivateMetadata(payload.view.private_metadata);
    if (!meta) return NextResponse.json({});

    const convex = getConvexClient();

    // Step 1: verify OAuth is connected; then move to DB selection.
    if (meta.step === "connect") {
      const session = await convex.query(api.setupSessions.getSetupSession, {
        id: meta.sessionId as Id<"setupSessions">
      });
      if (!session?.notionAccessToken) {
        const siteUrl = getSiteUrlFromRequest(request);
        return NextResponse.json({
          response_action: "update",
          view: buildConnectView({
            siteUrl,
            sessionId: meta.sessionId,
            slackTeamId: meta.slackTeamId,
            slackUserId: meta.slackUserId,
            channelId: meta.channelId,
            warning: "Notion isn’t connected yet. Click *Connect Notion* first, then try again."
          })
        });
      }

      const dbs = await convex.action(api.notion.listDatabasesForSetupSession, {
        sessionId: meta.sessionId as Id<"setupSessions">
      });

      return NextResponse.json({
        response_action: "update",
        view: buildDbSelectView({
          sessionId: meta.sessionId,
          slackTeamId: meta.slackTeamId,
          slackUserId: meta.slackUserId,
          channelId: meta.channelId,
          databases: dbs.databases
        })
      });
    }

    // Step 2: DB chosen; fetch schema and move to mapping.
    if (meta.step === "db") {
      const databaseId = getSelectedValue(payload.view.state.values, "db_block", "db_action");
      if (!databaseId) {
        return NextResponse.json({
          response_action: "errors",
          errors: { db_block: "Select a database." }
        });
      }

      const schema = await convex.action(api.notion.getDatabasePropertiesForSetupSession, {
        sessionId: meta.sessionId as Id<"setupSessions">,
        databaseId
      });

      return NextResponse.json({
        response_action: "update",
        view: buildMappingView({
          sessionId: meta.sessionId,
          slackTeamId: meta.slackTeamId,
          slackUserId: meta.slackUserId,
          channelId: meta.channelId,
          databaseId,
          titlePropertyId: schema.titlePropertyId,
          properties: schema.properties
        })
      });
    }

    // Step 3: Save.
    if (meta.step === "map") {
      const datePropertyId = getSelectedValue(payload.view.state.values, "date_block", "date_action");
      const hoursPropertyId = getSelectedValue(payload.view.state.values, "hours_block", "hours_action");
      const notePropertyId = getSelectedValue(payload.view.state.values, "note_block", "note_action");
      const mode = getSelectedValue(payload.view.state.values, "mode_block", "mode_action") ?? "notion";

      if (!datePropertyId) {
        return NextResponse.json({
          response_action: "errors",
          errors: { date_block: "Select a Date column." }
        });
      }
      if (!hoursPropertyId) {
        return NextResponse.json({
          response_action: "errors",
          errors: { hours_block: "Select an Hours (Number) column." }
        });
      }

      if (mode === "manual") {
        await convex.mutation(api.userConfig.setUserMode, {
          slackTeamId: meta.slackTeamId,
          slackUserId: meta.slackUserId,
          mode: "manual"
        });

        if (meta.channelId) {
          await slackApi("chat.postEphemeral", {
            channel: meta.channelId,
            user: meta.slackUserId,
            text:
              "Startclock configured for manual mode. `/stopclock` will return an ephemeral copy/paste summary (no Notion write)."
          });
        }
        return NextResponse.json({});
      }

      const session = await convex.query(api.setupSessions.getSetupSession, {
        id: meta.sessionId as Id<"setupSessions">
      });
      if (!session?.notionAccessToken) {
        return NextResponse.json({
          response_action: "errors",
          errors: { mode_block: "Notion is not connected. Go back and connect Notion first." }
        });
      }

      await convex.mutation(api.userConfig.setUserNotionConfigFromOAuth, {
        slackTeamId: meta.slackTeamId,
        slackUserId: meta.slackUserId,
        notionAccessToken: session.notionAccessToken,
        notionWorkspaceId: session.notionWorkspaceId,
        notionDatabaseId: meta.databaseId,
        datePropertyId,
        hoursPropertyId,
        notePropertyId,
        titlePropertyId: meta.titlePropertyId
      });

      if (meta.channelId) {
        await slackApi("chat.postEphemeral", {
          channel: meta.channelId,
          user: meta.slackUserId,
          text:
            "Startclock connected to Notion. You can now use `/startclock` and `/stopclock` to write entries."
        });
      }

      return NextResponse.json({});
    }

    return NextResponse.json({});
  }

  if (isBlockActionsPayload(payload)) {
    return NextResponse.json({});
  }

  return NextResponse.json({});
}

