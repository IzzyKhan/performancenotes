import { defineConfig } from "drizzle-kit";

// Local Studio uses the file DB. For Turso, set TURSO_* and use:
//   dialect: "turso" with url + authToken (see Drizzle Turso docs).
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/performancenotes.db",
  },
});
