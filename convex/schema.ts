import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  userConfig: defineTable({
    slackTeamId: v.string(),
    slackUserId: v.string(),
    // Integration mode: Notion (OAuth) or manual copy/paste.
    // Optional for backwards compatibility; treat missing as "notion".
    mode: v.optional(v.union(v.literal("notion"), v.literal("manual"))),

    // Notion OAuth token (preferred). `notionToken` remains for legacy /notionsetup.
    notionAccessToken: v.optional(v.string()),
    notionToken: v.optional(v.string()),

    // Notion workspace metadata (optional but useful for UI).
    notionWorkspaceId: v.optional(v.string()),

    notionDatabaseId: v.optional(v.string()),
    // Stored as Notion property IDs (stable even if renamed).
    datePropertyId: v.optional(v.string()),
    hoursPropertyId: v.optional(v.string()),
    notePropertyId: v.optional(v.string()),
    // Not in the MVP spec, but required to reliably create pages in a database.
    titlePropertyId: v.optional(v.string()),
    updatedAtMs: v.number()
  }).index("by_team_user", ["slackTeamId", "slackUserId"]),

  setupSessions: defineTable({
    slackTeamId: v.string(),
    slackUserId: v.string(),
    createdAtMs: v.number(),
    // Filled after Notion OAuth callback:
    notionAccessToken: v.optional(v.string()),
    notionWorkspaceId: v.optional(v.string())
  }).index("by_team_user", ["slackTeamId", "slackUserId"]),

  activeTimer: defineTable({
    slackTeamId: v.string(),
    slackUserId: v.string(),
    startedAtMs: v.number(),
    expiresAtMs: v.number(),
    note: v.optional(v.string()),
    channelId: v.optional(v.string())
  })
    .index("by_team_user", ["slackTeamId", "slackUserId"])
    .index("by_expires", ["expiresAtMs"])
});

