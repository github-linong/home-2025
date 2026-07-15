/**
 * Apply Better Auth schema to Postgres (Kysely migrate via better-auth/cli internals).
 * Prefer: npx @better-auth/cli migrate --config ./src/auth.js
 * This script is a thin wrapper that prints connection readiness.
 */
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL || process.env.API2_DATABASE_URL || "";
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
const { rows } = await client.query("select current_database() as db, current_user as user");
console.log("[api2] connected:", rows[0]);
await client.end();
console.log("[api2] OK — next run: npx @better-auth/cli@latest migrate --config ./src/auth.js");
