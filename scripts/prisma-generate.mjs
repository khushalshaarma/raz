/**
 * `npm run db:generate` / `postinstall` entry point.
 *
 * Derives the PostgreSQL schema from the canonical SQLite schema and then
 * generates the Prisma client for whichever provider `DATABASE_URL` selects.
 * See scripts/prisma-target.mjs for why two schemas exist.
 */

import {
  loadLocalEnv,
  resolvePrismaTarget,
  runPrisma,
  syncPostgresSchema,
} from "./prisma-target.mjs";

// Always refresh the derived schema first so it can never drift from the source.
syncPostgresSchema();

loadLocalEnv();

const { provider, schemaPath } = resolvePrismaTarget();

console.log(
  `\n[prisma] provider: ${provider}\n[prisma] schema:  ${schemaPath}\n`
);

runPrisma(["generate", "--schema", schemaPath]);
