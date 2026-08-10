import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull(),
  /** Stripe customer id when billing is enabled (Phase 4). */
  stripeCustomerId: text("stripe_customer_id"),
  /** free | solo | pro | dramaturg | null (free). Legacy organize/prep → pro on DB open. */
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
  /** ISO date (YYYY-MM-DD) when prep begins. */
  prepStartDate: text("prep_start_date"),
  /** ISO date (YYYY-MM-DD) when principal photography begins. */
  shootStartDate: text("shoot_start_date"),
  /** ISO date (YYYY-MM-DD) when the tech recce takes place. */
  techRecceDate: text("tech_recce_date"),
  /** When 1, prep must finish the day before tech recce instead of shoot start. */
  prepEndBeforeTechRecce: integer("prep_end_before_tech_recce")
    .notNull()
    .default(0),
  /** How many days per week the user will prep (1–7). */
  prepDaysPerWeek: integer("prep_days_per_week").notNull().default(5),
  /** Accent colour id (see src/lib/color-themes.ts) — "neutral" is the unstyled default. */
  colorTheme: text("color_theme").notNull().default("neutral"),
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
  /** 1 when the user has marked this scene as prepped. */
  prepped: integer("prepped").notNull().default(0),
  /** Slug-only on launch tiers — dialogue/action not persisted (empty string). */
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
  type: text("type").notNull(), // text | image | audio | video-link | mood | shot-list | image-grid
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

/** Project-scoped empty canvas layout templates. */
export const canvasTemplates = sqliteTable("canvas_templates", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sourceSceneId: text("source_scene_id"),
  nodes: text("nodes").notNull(), // JSON array of CanvasTemplateNode
  createdAt: text("created_at").notNull(),
});
