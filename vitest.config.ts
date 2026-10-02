import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    hookTimeout: 30000,
    testTimeout: 30000,
    // Run test files one at a time.
    //
    // The legacy suites under `tests/governance`, `tests/execution` and
    // `tests/agents` clean up with blanket `DELETE FROM <table>` across every
    // table, and several assert on global singleton rows (for example the
    // `systemHealth` emergency-stop flag). Running files concurrently against
    // one SQLite file therefore corrupts each other's fixtures: the failure
    // surfaces as a Prisma "Socket timeout ... database failed to respond"
    // or an assertion about a row another file just deleted, and the set of
    // failing tests changes between runs.
    //
    // Serialising files makes the suite deterministic. Individual tests within
    // a file still run normally.
    fileParallelism: false,
    // Run tests against a dedicated SQLite file.
    //
    // Many suites clean up with blanket `DELETE FROM merchant` / `DELETE FROM
    // user`. When they share the development database those deletes destroy the
    // seeded users and merchants, so any browser session still holding a JWT for
    // a deleted user starts receiving `404 {"error":"Merchant not found"}` from
    // the merchant APIs. Isolating the database keeps the dev/seed data intact.
    env: {
      DATABASE_URL: "file:./test.db",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
