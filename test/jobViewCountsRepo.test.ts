import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { incrementAndGetViewCount } from "../src/db/jobViewCounts.repo";

describe("incrementAndGetViewCount", () => {
  it("starts a job's count at 1 on its first view", async () => {
    const query = vi.fn(async () => ({ rows: [{ view_count: 1 }] }));
    const pool = { query } as unknown as Pool;

    const result = await incrementAndGetViewCount(pool, "abc123");

    expect(result).toBe(1);
    expect(query.mock.calls[0][1]).toEqual(["abc123"]);
  });

  it("increments an existing count on a later view", async () => {
    const query = vi.fn(async () => ({ rows: [{ view_count: 43 }] }));
    const pool = { query } as unknown as Pool;

    const result = await incrementAndGetViewCount(pool, "abc123");

    expect(result).toBe(43);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (job_id) DO UPDATE SET");
    expect(sql).toContain("view_count = job_view_counts.view_count + 1");
  });
});
