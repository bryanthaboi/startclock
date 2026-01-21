import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

type NotionDatabase = {
  properties: Record<
    string,
    {
      id: string;
      type: string;
    }
  >;
};

type NotionSearchResponse = {
  results: Array<{
    object: string;
    id: string;
    title?: Array<{ plain_text?: string }>;
  }>;
};

async function notionFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  return await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "notion-version": "2022-06-28",
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
}

function getNotionTokenFromConfig(config: {
  notionAccessToken?: string;
  notionToken?: string;
}): string | undefined {
  return config.notionAccessToken ?? config.notionToken;
}

function requirePropertyId(db: NotionDatabase, name: string, expectedType?: string): string {
  const prop = db.properties[name];
  if (!prop) throw new Error(`Property not found: ${name}`);
  if (expectedType && prop.type !== expectedType) {
    throw new Error(`Property "${name}" must be type ${expectedType} (got ${prop.type}).`);
  }
  return prop.id;
}

function findTitlePropertyId(db: NotionDatabase): string | undefined {
  for (const [, prop] of Object.entries(db.properties)) {
    if (prop.type === "title") return prop.id;
  }
  return undefined;
}

export const validateAndStoreNotionConfig = action({
  args: {
    slackTeamId: v.string(),
    slackUserId: v.string(),
    notionToken: v.string(),
    notionDatabaseId: v.string(),
    datePropertyName: v.string(),
    hoursPropertyName: v.string(),
    notePropertyName: v.optional(v.string())
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    ok: true;
    datePropertyId: string;
    hoursPropertyId: string;
    notePropertyId?: string;
    titlePropertyId?: string;
  }> => {
    // 1) Validate token
    const meRes = await notionFetch(args.notionToken, "/users/me", { method: "GET" });
    if (!meRes.ok) {
      if (meRes.status === 401) throw new Error("Invalid Notion token.");
      throw new Error(`Notion token validation failed (HTTP ${meRes.status}).`);
    }

    // 2) Fetch database schema
    const dbRes = await notionFetch(args.notionToken, `/databases/${args.notionDatabaseId}`, {
      method: "GET"
    });
    if (!dbRes.ok) {
      if (dbRes.status === 404) throw new Error("Notion database not found (or not shared).");
      throw new Error(`Failed to fetch Notion database (HTTP ${dbRes.status}).`);
    }
    const db = (await dbRes.json()) as NotionDatabase;

    // 3) Resolve property names to IDs
    const datePropertyId = requirePropertyId(db, args.datePropertyName, "date");
    const hoursPropertyId = requirePropertyId(db, args.hoursPropertyName, "number");
    const notePropertyId = args.notePropertyName
      ? requirePropertyId(db, args.notePropertyName, "rich_text")
      : undefined;
    const titlePropertyId = findTitlePropertyId(db);

    // 4) Store config
    await ctx.runMutation(api.userConfig.setUserConfig, {
      slackTeamId: args.slackTeamId,
      slackUserId: args.slackUserId,
      notionToken: args.notionToken,
      notionDatabaseId: args.notionDatabaseId,
      datePropertyId,
      hoursPropertyId,
      notePropertyId,
      titlePropertyId
    });

    return {
      ok: true as const,
      datePropertyId,
      hoursPropertyId,
      notePropertyId,
      titlePropertyId
    };
  }
});

export const writeNotionEntryAndStopTimer = action({
  args: { slackTeamId: v.string(), slackUserId: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<{
    ok: true;
    startedAtMs: number;
    elapsedMinutes: number;
    roundedMinutes: number;
    hours: number;
    url: string | null;
  }> => {
    const config = await ctx.runQuery(api.userConfig.getUserConfig, args);
    if (!config) throw new Error("No Notion config. Run setup first.");
    if ((config.mode ?? "notion") !== "notion") {
      throw new Error("User is not configured for Notion mode.");
    }
    const notionToken = getNotionTokenFromConfig(config);
    if (!notionToken) throw new Error("Missing Notion access token.");
    if (!config.notionDatabaseId) throw new Error("Missing Notion database.");
    if (!config.datePropertyId || !config.hoursPropertyId) {
      throw new Error("Missing Notion property mappings.");
    }

    const timer = await ctx.runQuery(api.timers.getActiveTimer, args);
    if (!timer) throw new Error("No active timer.");

    const nowMs = Date.now();
    const elapsedMinutes = (nowMs - timer.startedAtMs) / 60000;
    const roundedMinutes = Math.ceil(Math.max(1, elapsedMinutes) / 30) * 30;
    const hours = roundedMinutes / 60;
    const dateStr = new Date(timer.startedAtMs).toISOString().slice(0, 10);

    // Notion wants a title property for database pages; we set it even if user didn't map it.
    const titleText = timer.note?.trim() || `startclock ${dateStr}`;

    const properties: Record<string, unknown> = {
      [config.datePropertyId]: { date: { start: dateStr } },
      [config.hoursPropertyId]: { number: hours }
    };

    if (config.notePropertyId) {
      properties[config.notePropertyId] = {
        rich_text: [{ type: "text", text: { content: timer.note ?? "" } }]
      };
    }

    if (config.titlePropertyId) {
      properties[config.titlePropertyId] = {
        title: [{ type: "text", text: { content: titleText } }]
      };
    }

    const createRes = await notionFetch(notionToken, "/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: config.notionDatabaseId },
        properties
      })
    });
    if (!createRes.ok) {
      const body = await createRes.text().catch(() => "");
      throw new Error(`Notion create failed (HTTP ${createRes.status}). ${body}`.trim());
    }
    const created = (await createRes.json()) as { url?: string };

    await ctx.runMutation(api.timers.deleteTimer, args);

    return {
      ok: true as const,
      startedAtMs: timer.startedAtMs,
      elapsedMinutes,
      roundedMinutes,
      hours,
      url: created.url ?? null
    };
  }
});

export const listDatabasesForSetupSession = action({
  args: { sessionId: v.id("setupSessions") },
  handler: async (ctx, args): Promise<{ ok: true; databases: Array<{ id: string; title: string }> }> => {
    const session = await ctx.runQuery(api.setupSessions.getSetupSession, { id: args.sessionId });
    if (!session) throw new Error("Setup session not found.");
    if (!session.notionAccessToken) throw new Error("Notion not connected yet.");

    const searchRes = await notionFetch(session.notionAccessToken, "/search", {
      method: "POST",
      body: JSON.stringify({
        query: "",
        filter: { property: "object", value: "database" },
        page_size: 100
      })
    });
    if (!searchRes.ok) {
      const body = await searchRes.text().catch(() => "");
      throw new Error(`Notion search failed (HTTP ${searchRes.status}). ${body}`.trim());
    }

    const json = (await searchRes.json()) as NotionSearchResponse;
    const databases = (json.results ?? [])
      .filter((r) => r.object === "database")
      .map((r) => {
        const title = (r.title ?? []).map((t) => t.plain_text ?? "").join("").trim();
        return { id: r.id, title: title || r.id };
      })
      .sort((a, b) => a.title.localeCompare(b.title));

    return { ok: true as const, databases };
  }
});

export const getDatabasePropertiesForSetupSession = action({
  args: { sessionId: v.id("setupSessions"), databaseId: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<{
    ok: true;
    properties: Array<{ name: string; id: string; type: string }>;
    titlePropertyId?: string;
  }> => {
    const session = await ctx.runQuery(api.setupSessions.getSetupSession, { id: args.sessionId });
    if (!session) throw new Error("Setup session not found.");
    if (!session.notionAccessToken) throw new Error("Notion not connected yet.");

    const dbRes = await notionFetch(session.notionAccessToken, `/databases/${args.databaseId}`, {
      method: "GET"
    });
    if (!dbRes.ok) {
      const body = await dbRes.text().catch(() => "");
      throw new Error(`Failed to fetch Notion database (HTTP ${dbRes.status}). ${body}`.trim());
    }
    const db = (await dbRes.json()) as NotionDatabase;

    const properties = Object.entries(db.properties).map(([name, prop]) => ({
      name,
      id: prop.id,
      type: prop.type
    }));

    const titlePropertyId = findTitlePropertyId(db);
    return { ok: true as const, properties, titlePropertyId };
  }
});

