import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getInstallationByTeam = query({
  args: { slackTeamId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("slackInstallations")
      .withIndex("by_team", (q) => q.eq("slackTeamId", args.slackTeamId))
      .unique();
  }
});

export const upsertInstallation = mutation({
  args: {
    slackTeamId: v.string(),
    botAccessToken: v.string(),
    botUserId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("slackInstallations")
      .withIndex("by_team", (q) => q.eq("slackTeamId", args.slackTeamId))
      .unique();

    const installedAtMs = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        botAccessToken: args.botAccessToken,
        botUserId: args.botUserId,
        installedAtMs
      });
      return { updated: true as const };
    }

    await ctx.db.insert("slackInstallations", {
      slackTeamId: args.slackTeamId,
      botAccessToken: args.botAccessToken,
      botUserId: args.botUserId,
      installedAtMs
    });
    return { updated: false as const };
  }
});

