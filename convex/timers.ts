import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";

export const getActiveTimer = query({
  args: { slackTeamId: v.string(), slackUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activeTimer")
      .withIndex("by_team_user", (q) =>
        q.eq("slackTeamId", args.slackTeamId).eq("slackUserId", args.slackUserId)
      )
      .unique();
  }
});

export const createTimer = mutation({
  args: {
    slackTeamId: v.string(),
    slackUserId: v.string(),
    startedAtMs: v.number(),
    expiresAtMs: v.number(),
    note: v.optional(v.string()),
    channelId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("activeTimer")
      .withIndex("by_team_user", (q) =>
        q.eq("slackTeamId", args.slackTeamId).eq("slackUserId", args.slackUserId)
      )
      .unique();
    if (existing) {
      throw new Error("Active timer already exists.");
    }

    await ctx.db.insert("activeTimer", args);

    await ctx.scheduler.runAt(args.expiresAtMs, internal.scheduler.expireTimer, {
      slackTeamId: args.slackTeamId,
      slackUserId: args.slackUserId,
      startedAtMs: args.startedAtMs
    });

    return { ok: true as const };
  }
});

export const deleteTimer = mutation({
  args: { slackTeamId: v.string(), slackUserId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("activeTimer")
      .withIndex("by_team_user", (q) =>
        q.eq("slackTeamId", args.slackTeamId).eq("slackUserId", args.slackUserId)
      )
      .unique();
    if (!existing) return { deleted: false as const };
    await ctx.db.delete(existing._id);
    return { deleted: true as const };
  }
});

