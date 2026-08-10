/**
 * Stage 5a — SQLite via @libsql/client (local file or Turso remote).
 *
 * Local (default): file:./data/performancenotes.db
 * Hosted: set TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) on Railway.
 */

import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import fs from "fs";
import path from "path";
import * as schema from "./schema";

const DATA_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "performancenotes.db");

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __pn_libsql?: Client;
  __pn_db?: Db;
  __pn_ready?: Promise<void>;
};

function databaseUrl(): string {
  const turso = process.env.TURSO_DATABASE_URL?.trim();
  if (turso) return turso;

  // Avoid file locks when Next.js build workers collect page data in parallel
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return ":memory:";
  }

  return `file:${DB_PATH}`;
}

function getClient(): Client {
  if (!globalForDb.__pn_libsql) {
    const url = databaseUrl();
    if (url.startsWith("file:")) {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    }
    globalForDb.__pn_libsql = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    });
  }
  return globalForDb.__pn_libsql;
}

function getDb(): Db {
  if (!globalForDb.__pn_db) {
    globalForDb.__pn_db = drizzle(getClient(), { schema });
  }
  return globalForDb.__pn_db;
}

async function exec(sql: string, args: (string | number | null | bigint | ArrayBuffer)[] = []) {
  await getClient().execute({ sql, args });
}

async function tableColumns(table: string): Promise<string[]> {
  const result = await getClient().execute(`PRAGMA table_info(${table})`);
  return result.rows.map((row) => String(row.name));
}

async function ensureColumn(table: string, column: string, ddl: string) {
  const cols = await tableColumns(table);
  if (!cols.includes(column)) {
    await exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

async function initSchema() {
  const client = getClient();
  // Local file: WAL helps concurrent readers. Remote Turso ignores / may error.
  if (!process.env.TURSO_DATABASE_URL) {
    try {
      await client.execute("PRAGMA journal_mode = WAL");
      await client.execute("PRAGMA busy_timeout = 8000");
    } catch {
      // ignore — memory / remote
    }
  }
  try {
    await client.execute("PRAGMA foreign_keys = ON");
  } catch {
    // ignore
  }

  await exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      stripe_customer_id TEXT,
      plan TEXT,
      chat_usage_count INTEGER NOT NULL DEFAULT 0,
      chat_usage_reset_at TEXT
    )
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      prep_start_date TEXT,
      shoot_start_date TEXT,
      tech_recce_date TEXT,
      prep_end_before_tech_recce INTEGER NOT NULL DEFAULT 0,
      prep_days_per_week INTEGER NOT NULL DEFAULT 5,
      color_theme TEXT NOT NULL DEFAULT 'neutral'
    )
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS scripts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      episode_number INTEGER NOT NULL DEFAULT 1,
      source_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
      heading TEXT NOT NULL DEFAULT 'Scene 1',
      order_index INTEGER NOT NULL DEFAULT 0,
      scene_number TEXT,
      shoot_day INTEGER,
      shoot_order INTEGER,
      prepped INTEGER NOT NULL DEFAULT 0,
      raw_text TEXT NOT NULL,
      source_type TEXT NOT NULL,
      parsed_meta TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS canvas_nodes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      scene_id TEXT,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      position_x REAL NOT NULL DEFAULT 0,
      position_y REAL NOT NULL DEFAULT 0,
      label TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      scene_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS cheat_sheets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      scene_id TEXT,
      content TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS canvas_templates (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      source_scene_id TEXT,
      nodes TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await migrate();
}

/** Add columns introduced after the initial release to existing local DBs. */
async function migrate() {
  await ensureColumn("scenes", "heading", "heading TEXT NOT NULL DEFAULT 'Scene 1'");
  await ensureColumn("scenes", "order_index", "order_index INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("scenes", "scene_number", "scene_number TEXT");
  await ensureColumn("scenes", "shoot_day", "shoot_day INTEGER");
  await ensureColumn("scenes", "shoot_order", "shoot_order INTEGER");
  await ensureColumn("scenes", "prepped", "prepped INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("projects", "prep_start_date", "prep_start_date TEXT");
  await ensureColumn("projects", "shoot_start_date", "shoot_start_date TEXT");
  await ensureColumn("projects", "tech_recce_date", "tech_recce_date TEXT");
  await ensureColumn(
    "projects",
    "prep_end_before_tech_recce",
    "prep_end_before_tech_recce INTEGER NOT NULL DEFAULT 0"
  );
  await ensureColumn(
    "projects",
    "prep_days_per_week",
    "prep_days_per_week INTEGER NOT NULL DEFAULT 5"
  );
  await ensureColumn(
    "projects",
    "color_theme",
    "color_theme TEXT NOT NULL DEFAULT 'neutral'"
  );
  await ensureColumn("cheat_sheets", "scene_id", "scene_id TEXT");
  await ensureColumn("canvas_nodes", "scene_id", "scene_id TEXT");
  await ensureColumn("chat_messages", "scene_id", "scene_id TEXT");

  await ensureColumn("projects", "user_id", "user_id TEXT");
  await ensureColumn("users", "stripe_customer_id", "stripe_customer_id TEXT");
  await ensureColumn("users", "plan", "plan TEXT");
  await ensureColumn(
    "users",
    "chat_usage_count",
    "chat_usage_count INTEGER NOT NULL DEFAULT 0"
  );
  await ensureColumn("users", "chat_usage_reset_at", "chat_usage_reset_at TEXT");

  // Legacy plan slugs → pro (Free / Solo / Pro launch tiers)
  await exec(`UPDATE users SET plan = 'pro' WHERE plan IN ('organize', 'prep')`);

  const scriptCols = await tableColumns("scripts");
  if (!scriptCols.includes("episode_number")) {
    await exec(
      `ALTER TABLE scripts ADD COLUMN episode_number INTEGER NOT NULL DEFAULT 1`
    );
    await exec(`UPDATE scripts SET episode_number = order_index + 1`);
  }

  const sceneCols = await tableColumns("scenes");
  if (!sceneCols.includes("script_id")) {
    await exec(`ALTER TABLE scenes ADD COLUMN script_id TEXT`);

    const projectsResult = await getClient().execute(
      `SELECT id, title, created_at FROM projects`
    );

    for (const p of projectsResult.rows) {
      const projectId = String(p.id);
      const existing = await getClient().execute({
        sql: `SELECT id FROM scripts WHERE project_id = ? LIMIT 1`,
        args: [projectId],
      });
      if (existing.rows[0]) {
        await exec(
          `UPDATE scenes SET script_id = ? WHERE project_id = ? AND (script_id IS NULL OR script_id = '')`,
          [String(existing.rows[0].id), projectId]
        );
        continue;
      }

      const sceneRow = await getClient().execute({
        sql: `SELECT source_type, created_at FROM scenes WHERE project_id = ? ORDER BY order_index ASC LIMIT 1`,
        args: [projectId],
      });
      const first = sceneRow.rows[0];
      const scriptId = `script_${randomId()}`;
      const sourceType = first ? String(first.source_type) : "typed";
      const createdAt = first
        ? String(first.created_at)
        : String(p.created_at);

      await exec(
        `INSERT INTO scripts (id, project_id, title, order_index, episode_number, source_type, created_at)
         VALUES (?, ?, ?, 0, 1, ?, ?)`,
        [
          scriptId,
          projectId,
          String(p.title || "Script"),
          sourceType,
          createdAt,
        ]
      );
      await exec(
        `UPDATE scenes SET script_id = ? WHERE project_id = ? AND (script_id IS NULL OR script_id = '')`,
        [scriptId, projectId]
      );
    }
  }
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 14);
}

/** Ensure schema/migrations have run (call before first query on a cold process). */
export async function ensureDb(): Promise<Db> {
  if (!globalForDb.__pn_ready) {
    globalForDb.__pn_ready = initSchema();
  }
  await globalForDb.__pn_ready;
  return getDb();
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
