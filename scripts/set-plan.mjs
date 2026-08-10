// Manually set a user's plan — used to grant beta testers Solo/Pro for free.
//
//   node scripts/set-plan.mjs jane@example.com pro
//   node scripts/set-plan.mjs jane@example.com solo
//   node scripts/set-plan.mjs jane@example.com free
//
// Local: uses data/performancenotes.db
// Hosted Turso: set TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN), then:
//   railway run node scripts/set-plan.mjs their@email.com pro
import { createClient } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";

const VALID_PLANS = ["free", "solo", "pro", "dramaturg"];

const [email, plan] = process.argv.slice(2);
if (!email || !VALID_PLANS.includes(plan)) {
  console.error("Usage: node scripts/set-plan.mjs <email> <free|solo|pro|dramaturg>");
  process.exit(1);
}

const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
const dbPath = path.join(process.cwd(), "data", "performancenotes.db");

if (!tursoUrl && !fs.existsSync(dbPath)) {
  console.error(
    `Database not found at ${dbPath} and TURSO_DATABASE_URL is unset — run from the project root, or set Turso env.`
  );
  process.exit(1);
}

const client = createClient({
  url: tursoUrl || `file:${dbPath}`,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

const normalizedEmail = email.trim().toLowerCase();
const existing = await client.execute({
  sql: "SELECT id, email, plan FROM users WHERE email = ?",
  args: [normalizedEmail],
});
const user = existing.rows[0];

if (!user) {
  console.error(`No user with email ${email}`);
  process.exit(1);
}

await client.execute({
  sql: "UPDATE users SET plan = ? WHERE id = ?",
  args: [plan === "free" ? null : plan, String(user.id)],
});

console.log(`${user.email}: ${user.plan ?? "free"} → ${plan}`);
client.close();
