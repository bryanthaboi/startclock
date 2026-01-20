import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const expireTimer = internalMutation({
  args: { slackTeamId: v.string(), slackUserId: v.string(), startedAtMs: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("activeTimer")
      .withIndex("by_team_user", (q) =>
        q.eq("slackTeamId", args.slackTeamId).eq("slackUserId", args.slackUserId)
      )
      .unique();
    if (!existing) return;
    if (existing.startedAtMs !== args.startedAtMs) return;
    await ctx.db.delete(existing._id);
  }
});

