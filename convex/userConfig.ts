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
      await ctx.db.patch(existing._id, { ...args, updatedAtMs });
      return { updated: true as const };
    }
    await ctx.db.insert("userConfig", { ...args, updatedAtMs });
    return { updated: false as const };
  }
});

