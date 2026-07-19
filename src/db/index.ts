import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "./schema";

const DATA_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "performancenotes.db");

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __pn_sqlite?: Database.Database;
  __pn_db?: Db;
};

function initSchema(sqlite: Database.Database) {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 8000");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      stripe_customer_id TEXT,
      plan TEXT,
      chat_usage_count INTEGER NOT NULL DEFAULT 0,
      chat_usage_reset_at TEXT
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scripts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      episode_number INTEGER NOT NULL DEFAULT 1,
      source_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
      heading TEXT NOT NULL DEFAULT 'Scene 1',
      order_index INTEGER NOT NULL DEFAULT 0,
      scene_number TEXT,
      shoot_day INTEGER,
      shoot_order INTEGER,
      raw_text TEXT NOT NULL,
      source_type TEXT NOT NULL,
      parsed_meta TEXT,
      created_at TEXT NOT NULL
    );

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
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      scene_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cheat_sheets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      scene_id TEXT,
      content TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);

  migrate(sqlite);
}

/** Add columns introduced after the initial release to existing local DBs. */
function migrate(sqlite: Database.Database) {
  const ensureColumn = (table: string, column: string, ddl: string) => {
    const cols = sqlite
      .prepare(`PRAGMA table_info(${table})`)
      .all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  };

  ensureColumn("scenes", "heading", "heading TEXT NOT NULL DEFAULT 'Scene 1'");
  ensureColumn("scenes", "order_index", "order_index INTEGER NOT NULL DEFAULT 0");
  ensureColumn("scenes", "scene_number", "scene_number TEXT");
  ensureColumn("scenes", "shoot_day", "shoot_day INTEGER");
  ensureColumn("scenes", "shoot_order", "shoot_order INTEGER");
  ensureColumn("cheat_sheets", "scene_id", "scene_id TEXT");
  ensureColumn("canvas_nodes", "scene_id", "scene_id TEXT");
  ensureColumn("chat_messages", "scene_id", "scene_id TEXT");

  // Users + project ownership (Phase 2)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      stripe_customer_id TEXT,
      plan TEXT,
      chat_usage_count INTEGER NOT NULL DEFAULT 0,
      chat_usage_reset_at TEXT
    );
  `);
  ensureColumn("projects", "user_id", "user_id TEXT");
  ensureColumn("users", "stripe_customer_id", "stripe_customer_id TEXT");
  ensureColumn("users", "plan", "plan TEXT");
  ensureColumn("users", "chat_usage_count", "chat_usage_count INTEGER NOT NULL DEFAULT 0");
  ensureColumn("users", "chat_usage_reset_at", "chat_usage_reset_at TEXT");

  // Multi-script: create scripts table + backfill script_id on existing scenes
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS scripts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      episode_number INTEGER NOT NULL DEFAULT 1,
      source_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const scriptCols = sqlite
    .prepare(`PRAGMA table_info(scripts)`)
    .all() as { name: string }[];
  if (!scriptCols.some((c) => c.name === "episode_number")) {
    sqlite.exec(
      `ALTER TABLE scripts ADD COLUMN episode_number INTEGER NOT NULL DEFAULT 1`
    );
    sqlite.exec(`UPDATE scripts SET episode_number = order_index + 1`);
  }

  const sceneCols = sqlite
    .prepare(`PRAGMA table_info(scenes)`)
    .all() as { name: string }[];
  if (!sceneCols.some((c) => c.name === "script_id")) {
    sqlite.exec(`ALTER TABLE scenes ADD COLUMN script_id TEXT`);

    const projects = sqlite
      .prepare(`SELECT id, title, created_at FROM projects`)
      .all() as { id: string; title: string; created_at: string }[];

    const insertScript = sqlite.prepare(
      `INSERT INTO scripts (id, project_id, title, order_index, episode_number, source_type, created_at)
       VALUES (?, ?, ?, 0, 1, ?, ?)`
    );
    const updateScenes = sqlite.prepare(
      `UPDATE scenes SET script_id = ? WHERE project_id = ? AND (script_id IS NULL OR script_id = '')`
    );

    const tx = sqlite.transaction(() => {
      for (const p of projects) {
        const existing = sqlite
          .prepare(`SELECT id FROM scripts WHERE project_id = ? LIMIT 1`)
          .get(p.id) as { id: string } | undefined;
        if (existing) {
          updateScenes.run(existing.id, p.id);
          continue;
        }

        const sceneRow = sqlite
          .prepare(
            `SELECT source_type, created_at FROM scenes WHERE project_id = ? ORDER BY order_index ASC LIMIT 1`
          )
          .get(p.id) as
          | { source_type: string; created_at: string }
          | undefined;

        const scriptId = `script_${randomId()}`;
        const sourceType = sceneRow?.source_type ?? "typed";
        const createdAt = sceneRow?.created_at ?? p.created_at;
        insertScript.run(
          scriptId,
          p.id,
          p.title || "Script",
          sourceType,
          createdAt
        );
        updateScenes.run(scriptId, p.id);
      }
    });
    tx();
  }
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 14);
}

function openDatabase(): Database.Database {
  // Avoid file locks when Next.js build workers collect page data in parallel
  if (process.env.NEXT_PHASE === "phase-production-build") {
    const sqlite = new Database(":memory:");
    initSchema(sqlite);
    return sqlite;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const sqlite = new Database(DB_PATH, { timeout: 8000 });
  initSchema(sqlite);
  return sqlite;
}

function getSqlite(): Database.Database {
  if (!globalForDb.__pn_sqlite) {
    globalForDb.__pn_sqlite = openDatabase();
  }
  return globalForDb.__pn_sqlite;
}

function getDb(): Db {
  if (!globalForDb.__pn_db) {
    globalForDb.__pn_db = drizzle(getSqlite(), { schema });
  }
  return globalForDb.__pn_db;
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/** Raw better-sqlite3 handle (for transactions). */
export const sqlite = new Proxy({} as Database.Database, {
  get(_target, prop, receiver) {
    const real = getSqlite();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
