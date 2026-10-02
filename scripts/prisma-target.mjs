/**
 * Shared Prisma schema resolution.
 *
 * `datasource.provider` is a literal in a Prisma schema and cannot be switched
 * by an environment variable, so GrowthOS carries two schemas:
 *
 *   prisma/schema.prisma             canonical, hand-edited (SQLite by default)
 *   prisma/schema.postgres.prisma    derived from it by prisma-generate.mjs
 *
 * The active one is chosen from the scheme of `DATABASE_URL`, so local
 * development keeps using the committed SQLite database while a Vercel
 * deployment generates a PostgreSQL client.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const SQLITE_SCHEMA = join(REPO_ROOT, "prisma", "schema.prisma");
export const POSTGRES_SCHEMA = join(REPO_ROOT, "prisma", "schema.postgres.prisma");

/** Minimal `KEY=value` parser, used only on Node versions without loadEnvFile. */
function parseEnvFile(envPath) {
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

/**
 * Load the local `.env` so `postinstall`/`db:*` scripts can resolve
 * `DATABASE_URL` the way the Prisma CLI used to on its own.
 *
 * Real environment variables always win: on Vercel the dashboard-injected
 * values are authoritative and must not be overwritten by a committed file.
 * `.env` is gitignored, so this is a local-development convenience only.
 */
export function loadLocalEnv() {
  const envPath = join(REPO_ROOT, ".env");
  if (!existsSync(envPath)) return;

  const before = { ...process.env };

  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(envPath);
    } catch {
      parseEnvFile(envPath);
    }
  } else {
    parseEnvFile(envPath);
  }

  // Restore anything that was already set so the real environment wins.
  for (const [key, value] of Object.entries(before)) {
    if (value !== undefined) process.env[key] = value;
  }
}

const BANNER = [
  "// ============================================================================",
  "// GENERATED FILE - DO NOT EDIT.",
  "//",
  "// Derived from prisma/schema.prisma by scripts/prisma-generate.mjs.",
  "// Edit the SQLite schema (the single source of truth) and re-run, e.g.:",
  "//     npm run db:generate",
  "// ============================================================================",
  "",
].join("\n");

const DATASOURCE_RE = /datasource\s+db\s*\{[^}]*\}/;

/**
 * Rewrite the datasource block for PostgreSQL.
 *
 * `directUrl` is added because a pooled connection cannot run migrations.
 * Neon and Supabase both issue a pooled URL for runtime plus a direct URL for
 * migrations, and `prisma migrate` / `prisma db push` need the latter.
 */
export function toPostgresSchema(sqliteSchema) {
  if (!DATASOURCE_RE.test(sqliteSchema)) {
    throw new Error(
      "Could not find a `datasource db { ... }` block in prisma/schema.prisma"
    );
  }

  const replacement = [
    "datasource db {",
    '  provider  = "postgresql"',
    '  url       = env("DATABASE_URL")',
    '  directUrl = env("DIRECT_URL")',
    "}",
  ].join("\n");

  return BANNER + sqliteSchema.replace(DATASOURCE_RE, replacement);
}

/** Refresh `prisma/schema.postgres.prisma` from the canonical schema. */
export function syncPostgresSchema() {
  const generated = toPostgresSchema(readFileSync(SQLITE_SCHEMA, "utf8"));
  const current = existsSync(POSTGRES_SCHEMA)
    ? readFileSync(POSTGRES_SCHEMA, "utf8")
    : null;

  if (current !== generated) {
    writeFileSync(POSTGRES_SCHEMA, generated, "utf8");
  }
}

/**
 * Pick the schema for the current environment.
 *
 * A `file:` URL means local development; anything else (postgres://,
 * postgresql://) is treated as a hosted production database.
 */
export function resolvePrismaTarget() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Prisma cannot resolve a datasource. Copy .env.example to .env."
    );
  }

  // `prisma generate` resolves the datasource at generate time, so make sure
  // DIRECT_URL always has a value. A direct connection is only truly needed for
  // migrations, and it must never be a pooled URL.
  if (!process.env.DIRECT_URL) {
    process.env.DIRECT_URL = databaseUrl;
  }

  const sqlite = databaseUrl.startsWith("file:");
  return {
    provider: sqlite ? "sqlite" : "postgresql",
    schemaPath: sqlite ? SQLITE_SCHEMA : POSTGRES_SCHEMA,
  };
}

/**
 * Run the Prisma CLI with the current Node binary.
 *
 * Invoked directly rather than through `npx prisma ...` so the schema path is
 * passed as a real argv entry: `shell: true` would concatenate it into a
 * command string (Node warns that can be a security problem), and it also breaks
 * on Windows when the path contains spaces.
 */
export function runPrisma(args) {
  const cli = join(REPO_ROOT, "node_modules", "prisma", "build", "index.js");

  if (!existsSync(cli)) {
    throw new Error(
      "Could not find the Prisma CLI at node_modules/prisma. Run `npm install` first."
    );
  }

  execFileSync(process.execPath, [cli, ...args], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: process.env,
  });
}
