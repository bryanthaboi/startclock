import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getUserConfig = query({
  args: { slackTeamId: v.string(), slackUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userConfig")
      .withIndex("by_team_user", (q) =>
        q.eq("slackTeamId", args.slackTeamId).eq("slackUserId", args.slackUserId)
      )
      .unique();
  }
});

export const getUserConfigStatus = query({
  args: { slackTeamId: v.string(), slackUserId: v.string() },
  handler: async (ctx, args) => {
    const cfg = await ctx.db
      .query("userConfig")
      .withIndex("by_team_user", (q) =>
        q.eq("slackTeamId", args.slackTeamId).eq("slackUserId", args.slackUserId)
      )
      .unique();

    const mode = cfg?.mode ?? "notion";
    const notionToken = cfg?.notionAccessToken ?? cfg?.notionToken;
    const hasNotionConfig = Boolean(
      notionToken &&
        cfg?.notionDatabaseId &&
        cfg?.datePropertyId &&
        cfg?.hoursPropertyId &&
        (mode === "notion")
    );

    return {
      exists: Boolean(cfg),
      mode,
      hasNotionConfig
    };
  }
});

export const setUserConfig = mutation({
  args: {
    slackTeamId: v.string(),
    slackUserId: v.string(),
    notionToken: v.string(),
    notionDatabaseId: v.string(),
    datePropertyId: v.string(),
    hoursPropertyId: v.string(),
    notePropertyId: v.optional(v.string()),
    titlePropertyId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userConfig")
      .withIndex("by_team_user", (q) =>
        q.eq("slackTeamId", args.slackTeamId).eq("slackUserId", args.slackUserId)
      )
      .unique();

    const updatedAtMs = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, mode: "notion", updatedAtMs });
      return { updated: true as const };
    }
    await ctx.db.insert("userConfig", { ...args, mode: "notion", updatedAtMs });
    return { updated: false as const };
  }
});

export const setUserMode = mutation({
  args: {
    slackTeamId: v.string(),
    slackUserId: v.string(),
    mode: v.union(v.literal("notion"), v.literal("manual"))
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userConfig")
      .withIndex("by_team_user", (q) =>
        q.eq("slackTeamId", args.slackTeamId).eq("slackUserId", args.slackUserId)
      )
      .unique();

    const updatedAtMs = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { mode: args.mode, updatedAtMs });
      return { updated: true as const };
    }

    await ctx.db.insert("userConfig", {
      slackTeamId: args.slackTeamId,
      slackUserId: args.slackUserId,
      mode: args.mode,
      updatedAtMs
    });
    return { updated: false as const };
  }
});

export const setUserNotionConfigFromOAuth = mutation({
  args: {
    slackTeamId: v.string(),
    slackUserId: v.string(),
    notionAccessToken: v.string(),
    notionWorkspaceId: v.optional(v.string()),
    notionDatabaseId: v.string(),
    datePropertyId: v.string(),
    hoursPropertyId: v.string(),
    notePropertyId: v.optional(v.string()),
    titlePropertyId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userConfig")
      .withIndex("by_team_user", (q) =>
        q.eq("slackTeamId", args.slackTeamId).eq("slackUserId", args.slackUserId)
      )
      .unique();

    const updatedAtMs = Date.now();
    const patch = {
      slackTeamId: args.slackTeamId,
      slackUserId: args.slackUserId,
      mode: "notion" as const,
      notionAccessToken: args.notionAccessToken,
      notionWorkspaceId: args.notionWorkspaceId,
      notionDatabaseId: args.notionDatabaseId,
      datePropertyId: args.datePropertyId,
      hoursPropertyId: args.hoursPropertyId,
      notePropertyId: args.notePropertyId,
      titlePropertyId: args.titlePropertyId,
      updatedAtMs
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return { updated: true as const };
    }
    await ctx.db.insert("userConfig", patch);
    return { updated: false as const };
  }
});

