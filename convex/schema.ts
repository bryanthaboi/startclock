import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  userConfig: defineTable({
    slackTeamId: v.string(),
    slackUserId: v.string(),
    notionToken: v.string(),
    notionDatabaseId: v.string(),
    // Stored as Notion property IDs (stable even if renamed).
    datePropertyId: v.string(),
    hoursPropertyId: v.string(),
    notePropertyId: v.optional(v.string()),
    // Not in the MVP spec, but required to reliably create pages in a database.
    titlePropertyId: v.optional(v.string()),
    updatedAtMs: v.number()
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

