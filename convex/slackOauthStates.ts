import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createState = mutation({
  args: {
    state: v.string(),
    slackTeamIdHint: v.optional(v.string()),
    slackUserIdHint: v.optional(v.string()),
    channelIdHint: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("slackOauthStates", {
      state: args.state,
      slackTeamIdHint: args.slackTeamIdHint,
      slackUserIdHint: args.slackUserIdHint,
      channelIdHint: args.channelIdHint,
      createdAtMs: Date.now()
    });
    return { ok: true as const };
  }
});

export const getByState = query({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("slackOauthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .unique();
  }
});

export const consumeState = mutation({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("slackOauthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .unique();
    if (!existing) return { ok: false as const };
    await ctx.db.delete(existing._id);
    return { ok: true as const, value: existing };
  }
});

