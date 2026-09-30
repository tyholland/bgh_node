import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { runMigrations } from "../src/db/migrate";

const MIGRATION_FILES = [
  "001_init.sql",
  "002_users.sql",
  "003_saved_searches.sql",
  "004_jobs_query_indexes.sql",
  "005_user_email_notifications.sql",
];

const makeFakePool = (appliedFilenames: string[]) => {
  const client = {
    query: vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] };
      }

      return { rows: [] };
    }),
    release: vi.fn(),
  };

  const pool = {
    query: vi.fn(async (sql: string) => {
      if (sql.toLowerCase().includes("select filename")) {
        return { rows: appliedFilenames.map((filename) => ({ filename })) };
      }

      return { rows: [] };
    }),
    connect: vi.fn(async () => client as unknown as PoolClient),
  };

  return { pool: pool as unknown as Pool, client, poolMock: pool };
};

describe("runMigrations", () => {
  it("ensures the ledger table exists before checking applied migrations", async () => {
    const { pool, poolMock } = makeFakePool([]);

    await runMigrations(pool);

    const ledgerCreated = poolMock.query.mock.calls.some(([sql]) =>
      String(sql)
        .toLowerCase()
        .includes("create table if not exists schema_migrations"),
    );

    expect(ledgerCreated).toBe(true);
  });

  it("applies every migration exactly once and records each in the ledger", async () => {
    const { pool, client } = makeFakePool([]);

    await runMigrations(pool);

    const recordedInserts = client.query.mock.calls
      .filter(([sql]) =>
        String(sql).toLowerCase().includes("insert into schema_migrations"),
      )
      .map(([, params]) => (params as string[])[0]);

    expect(recordedInserts).toEqual(MIGRATION_FILES);
  });

  it("skips migrations already recorded in the ledger", async () => {
    const { pool, client } = makeFakePool(MIGRATION_FILES);

    await runMigrations(pool);

    expect(client.query).not.toHaveBeenCalled();
  });

  it("applies only the migrations missing from the ledger", async () => {
    const { pool, client } = makeFakePool(MIGRATION_FILES.slice(0, 2));

    await runMigrations(pool);

    const recordedInserts = client.query.mock.calls
      .filter(([sql]) =>
        String(sql).toLowerCase().includes("insert into schema_migrations"),
      )
      .map(([, params]) => (params as string[])[0]);

    expect(recordedInserts).toEqual(MIGRATION_FILES.slice(2));
  });

  it("rolls back and stops on the first migration that fails, without recording it", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql === "BEGIN" || sql === "ROLLBACK") {
          return { rows: [] };
        }

        if (sql.toLowerCase().includes("insert into schema_migrations")) {
          throw new Error("should not reach the ledger insert");
        }

        // The migration file body itself.
        throw new Error("syntax error in migration");
      }),
      release: vi.fn(),
    };

    const pool = {
      query: vi.fn(async (sql: string) => {
        if (sql.toLowerCase().includes("select filename")) {
          return { rows: [] };
        }

        return { rows: [] };
      }),
      connect: vi.fn(async () => client as unknown as PoolClient),
    } as unknown as Pool;

    await expect(runMigrations(pool)).rejects.toThrow(
      "syntax error in migration",
    );

    const rolledBack = client.query.mock.calls.some(
      ([sql]) => sql === "ROLLBACK",
    );
    expect(rolledBack).toBe(true);

    // Only the first migration should have been attempted.
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
