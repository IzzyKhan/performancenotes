import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull(),
  /** Stripe customer id when billing is enabled (Phase 4). */
  stripeCustomerId: text("stripe_customer_id"),
  /** prep | dramaturg | null (free/pilot). */
  plan: text("plan"),
  /** Monthly Claude request count (quota). */
  chatUsageCount: integer("chat_usage_count").notNull().default(0),
  chatUsageResetAt: text("chat_usage_reset_at"),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  createdAt: text("created_at").notNull(),
});

export const scripts = sqliteTable("scripts", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  episodeNumber: integer("episode_number").notNull().default(1),
  sourceType: text("source_type").notNull(), // pdf | typed
  createdAt: text("created_at").notNull(),
});

export const scenes = sqliteTable("scenes", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  scriptId: text("script_id")
    .notNull()
    .references(() => scripts.id, { onDelete: "cascade" }),
  heading: text("heading").notNull().default("Scene 1"),
  orderIndex: integer("order_index").notNull().default(0),
  /** Production scene number from the script when present (e.g. "28", "28A"). */
  sceneNumber: text("scene_number"),
  shootDay: integer("shoot_day"),
  shootOrder: integer("shoot_order"),
  rawText: text("raw_text").notNull(),
  sourceType: text("source_type").notNull(), // pdf | typed
  parsedMeta: text("parsed_meta"), // JSON string
  createdAt: text("created_at").notNull(),
});

export const canvasNodes = sqliteTable("canvas_nodes", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  sceneId: text("scene_id"), // null = project-wide (legacy)
  type: text("type").notNull(), // text | image | audio | video-link | mood
  content: text("content").notNull(), // JSON string
  positionX: real("position_x").notNull().default(0),
  positionY: real("position_y").notNull().default(0),
  label: text("label"),
  createdAt: text("created_at").notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  sceneId: text("scene_id"), // null = project-wide (legacy)
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

export const cheatSheets = sqliteTable("cheat_sheets", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  sceneId: text("scene_id"), // null for legacy project-wide sheets
  content: text("content").notNull(), // JSON string
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
});
