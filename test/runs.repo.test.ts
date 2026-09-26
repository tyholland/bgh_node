import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { getIncompleteRun } from "../src/db/runs.repo";
import type { IngestRun } from "../src/types";

const baseRun: IngestRun = {
  id: "run-1",
  started_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
  ok: true,
  rows_in: 10,
  rows_enriched: 5,
  rows_failed: 0,
  error: null,
};

const makeFakePool = (lastRun: IngestRun | null) => {
  const pool = {
    query: vi.fn(async () => ({ rows: lastRun ? [lastRun] : [] })),
  };

  return pool as unknown as Pool;
};

describe("getIncompleteRun", () => {
  it("returns null when there are no runs", async () => {
    const pool = makeFakePool(null);

    await expect(getIncompleteRun(pool)).resolves.toBeNull();
  });

  it("returns null when the last run finished successfully", async () => {
    const pool = makeFakePool({ ...baseRun, ok: true });

    await expect(getIncompleteRun(pool)).resolves.toBeNull();
  });

  it("returns the run when it never finished (finished_at is null)", async () => {
    const orphaned: IngestRun = {
      ...baseRun,
      finished_at: null,
      ok: null,
    };
    const pool = makeFakePool(orphaned);

    await expect(getIncompleteRun(pool)).resolves.toEqual(orphaned);
  });

  it("returns the run when it finished but failed (ok = false)", async () => {
    const failed: IngestRun = {
      ...baseRun,
      ok: false,
      error: "network down",
    };
    const pool = makeFakePool(failed);

    await expect(getIncompleteRun(pool)).resolves.toEqual(failed);
  });
});
