import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  REPO_ROOT,
  SQLITE_SCHEMA,
  POSTGRES_SCHEMA,
  resolvePrismaTarget,
  syncPostgresSchema,
  toPostgresSchema,
} from "../../scripts/prisma-target.mjs";

const sqliteSchema = readFileSync(SQLITE_SCHEMA, "utf8");

describe("prisma provider selection", () => {
  const savedUrl = process.env.DATABASE_URL;
  const savedDirectUrl = process.env.DIRECT_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_URL;
  });
  afterEach(() => {
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    if (savedDirectUrl === undefined) delete process.env.DIRECT_URL;
    else process.env.DIRECT_URL = savedDirectUrl;
  });

  it("uses the SQLite schema for a local file: URL", () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const target = resolvePrismaTarget();
    expect(target.provider).toBe("sqlite");
    expect(target.schemaPath).toBe(SQLITE_SCHEMA);
  });

  it("uses the PostgreSQL schema for a hosted postgres URL", () => {
    // Neon/Supabase both hand out postgresql:// URLs; the pooled form must be
    // recognised too, because that is what production actually sets.
    process.env.DATABASE_URL =
      "postgresql://user:pass@ep-x.us-east-2.aws.neon.tech/growthos?sslmode=require";
    const target = resolvePrismaTarget();
    expect(target.provider).toBe("postgresql");
    expect(target.schemaPath).toBe(POSTGRES_SCHEMA);
  });

  it("throws a helpful error when DATABASE_URL is missing", () => {
    expect(() => resolvePrismaTarget()).toThrow(/DATABASE_URL is not set/);
  });

  it("defaults DIRECT_URL to DATABASE_URL so generate never fails", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@db:5432/growthos";
    resolvePrismaTarget();
    // Migrations cannot run over a pooled connection, so DIRECT_URL must be
    // populated for `prisma migrate` / `db push` to resolve the datasource.
    expect(process.env.DIRECT_URL).toBe("postgresql://user:pass@db:5432/growthos");
  });
});

describe("derived PostgreSQL schema", () => {
  it("rewrites the datasource to postgresql and adds directUrl", () => {
    const derived = toPostgresSchema(sqliteSchema);
    expect(derived).toContain('provider  = "postgresql"');
    expect(derived).toContain('url       = env("DATABASE_URL")');
    expect(derived).toContain('directUrl = env("DIRECT_URL")');
    expect(derived).not.toContain('provider = "sqlite"');
  });

  it("keeps every model identical to the canonical schema", () => {
    // The generated file must never drift: only the datasource block may differ.
    const derived = toPostgresSchema(sqliteSchema);
    const strip = (s: string) =>
      s
        // Drop the "GENERATED FILE" banner, then the datasource block.
        .replace(/^\/\/ =+\r?\n[\s\S]*?^\/\/ =+\r?\n/m, "")
        .replace(/datasource\s+db\s*\{[^}]*\}/, "DATASOURCE")
        .replace(/\r\n/g, "\n");
    expect(strip(derived)).toBe(strip(sqliteSchema));
  });

  it("marks the derived file as generated and gitignored", () => {
    expect(existsSync(POSTGRES_SCHEMA)).toBe(true);
    expect(readFileSync(POSTGRES_SCHEMA, "utf8")).toMatch(/GENERATED FILE - DO NOT EDIT/);
    expect(readFileSync(join(REPO_ROOT, ".gitignore"), "utf8")).toContain(
      "prisma/schema.postgres.prisma"
    );
  });

  it("is idempotent", () => {
    syncPostgresSchema();
    const first = readFileSync(POSTGRES_SCHEMA, "utf8");
    syncPostgresSchema();
    expect(readFileSync(POSTGRES_SCHEMA, "utf8")).toBe(first);
  });
});
