/**
 * `npm run db:push` entry point.
 *
 * Applies the schema for the provider the current `DATABASE_URL` selects, so the
 * same command works against local SQLite and a hosted PostgreSQL database.
 *
 * Guarded against the two destructive mistakes this project cares about:
 *   - `--force-reset` / `--accept-data-loss` against a non-local database,
 *   - pushing to a hosted database at all without the operator asking for it.
 */

import {
  loadLocalEnv,
  resolvePrismaTarget,
  runPrisma,
  syncPostgresSchema,
} from "./prisma-target.mjs";

const args = process.argv.slice(2);
const destructive = args.some((a) =>
  a === "--force-reset" || a.startsWith("--force-reset=") || a === "--accept-data-loss"
);

syncPostgresSchema();
loadLocalEnv();

const { provider, schemaPath } = resolvePrismaTarget();

if (destructive && provider !== "sqlite") {
  console.error(
    [
      "",
      "Refusing to run a destructive schema command against a hosted database.",
      "",
      `  DATABASE_URL provider: ${provider}`,
      `  command: prisma db push ${args.join(" ")}`,
      "",
      "This drops all data. GrowthOS seed data is demo data, but real records",
      "must never be destroyed by a convenience script.",
      "",
      "If you really mean it, run the Prisma CLI directly:",
      `  npx prisma db push ${args.join(" ")} --schema ${schemaPath}`,
      "",
    ].join("\n")
  );
  process.exit(1);
}

syncPostgresSchema();

syncPostgresSchema();

console.log(
  `\n[prisma] provider: ${provider}\n[prisma] schema:  ${schemaPath}\n`
);

runPrisma(["db", "push", ...args, "--schema", schemaPath]);
