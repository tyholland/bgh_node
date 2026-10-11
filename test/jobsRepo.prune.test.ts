import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pruneStaleJobs } from "../src/db/jobs.repo";

const makeFakePool = (rowCount: number) => {
  const query = vi.fn(async () => ({ rowCount }));
  return { pool: { query } as unknown as Pool, query };
};

describe("pruneStaleJobs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deletes jobs last seen before the JOBS_STALE_MONTHS cutoff (default 3 months)", async () => {
    const { pool, query } = makeFakePool(0);

    await pruneStaleJobs(pool);

    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("DELETE FROM jobs WHERE last_seen_at < $1");
    expect(values).toEqual(["2026-03-15T00:00:00.000Z"]);
  });

  it("returns the number of rows removed", async () => {
    const { pool } = makeFakePool(7);

    const result = await pruneStaleJobs(pool);

    expect(result).toBe(7);
  });

  it("returns 0 when nothing was pruned", async () => {
    const { pool } = makeFakePool(0);

    const result = await pruneStaleJobs(pool);

    expect(result).toBe(0);
  });
});
