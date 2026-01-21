import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createSetupSession = mutation({
  args: { slackTeamId: v.string(), slackUserId: v.string() },
  handler: async (ctx, args) => {
    const createdAtMs = Date.now();
    const id = await ctx.db.insert("setupSessions", { ...args, createdAtMs });
    return { id };
  }
});

export const getSetupSession = query({
  args: { id: v.id("setupSessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  }
});

export const attachNotionToSetupSession = mutation({
  args: {
    id: v.id("setupSessions"),
    notionAccessToken: v.string(),
    notionWorkspaceId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Setup session not found.");
    await ctx.db.patch(args.id, {
      notionAccessToken: args.notionAccessToken,
      notionWorkspaceId: args.notionWorkspaceId
    });
    return { ok: true as const };
  }
});

