import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  deleteSavedJob,
  insertSavedJob,
  listSavedJobsByUid,
} from "../src/db/savedJobs.repo";

const makeFakePool = (resultsByCall: unknown[][]) => {
  let call = 0;
  const query = vi.fn(async () => ({ rows: resultsByCall[call++] ?? [] }));

  return { pool: { query } as unknown as Pool, query };
};

describe("insertSavedJob", () => {
  it("returns the inserted row on a fresh save", async () => {
    const row = {
      id: "1",
      uid: "uid-1",
      job_id: "abc123",
      role_name: "Backend Engineer",
      company: "Globex",
      link: "https://x",
      created_at: new Date().toISOString(),
    };
    const { pool, query } = makeFakePool([[row]]);

    const result = await insertSavedJob(pool, "uid-1", {
      jobId: "abc123",
      roleName: "Backend Engineer",
      company: "Globex",
      link: "https://x",
    });

    expect(result).toEqual(row);
    // ON CONFLICT ... RETURNING returned a row, so no second SELECT needed.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("re-selects the existing row when the job was already saved (ON CONFLICT DO NOTHING)", async () => {
    const existing = {
      id: "1",
      uid: "uid-1",
      job_id: "abc123",
      role_name: "Backend Engineer",
      company: "Globex",
      link: "https://x",
      created_at: new Date().toISOString(),
    };
    // First call (the INSERT) returns no row (conflict); second call
    // (the fallback SELECT) returns the existing one.
    const { pool, query } = makeFakePool([[], [existing]]);

    const result = await insertSavedJob(pool, "uid-1", {
      jobId: "abc123",
      roleName: "Backend Engineer",
      company: "Globex",
      link: "https://x",
    });

    expect(result).toEqual(existing);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain("SELECT * FROM saved_jobs");
  });

  it("stores null when no company is given", async () => {
    const { pool, query } = makeFakePool([
      [
        {
          id: "1",
          uid: "uid-1",
          job_id: "abc123",
          role_name: "Backend Engineer",
          company: null,
          link: "https://x",
          created_at: new Date().toISOString(),
        },
      ],
    ]);

    await insertSavedJob(pool, "uid-1", {
      jobId: "abc123",
      roleName: "Backend Engineer",
      company: undefined,
      link: "https://x",
    });

    const [, values] = query.mock.calls[0];
    expect(values).toEqual([
      "uid-1",
      "abc123",
      "Backend Engineer",
      null,
      "https://x",
    ]);
  });
});

describe("listSavedJobsByUid", () => {
  it("scopes the query to the given uid, newest first", async () => {
    const { pool, query } = makeFakePool([[]]);

    await listSavedJobsByUid(pool, "uid-1");

    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("WHERE uid = $1");
    expect(sql).toContain("ORDER BY created_at DESC");
    expect(values).toEqual(["uid-1"]);
  });
});

describe("deleteSavedJob", () => {
  it("returns true when a row was deleted", async () => {
    const query = vi.fn(async () => ({ rowCount: 1 }));
    const pool = { query } as unknown as Pool;

    const result = await deleteSavedJob(pool, "row-1", "uid-1");

    expect(result).toBe(true);
    expect(query.mock.calls[0][1]).toEqual(["row-1", "uid-1"]);
  });

  it("returns false when nothing matched", async () => {
    const query = vi.fn(async () => ({ rowCount: 0 }));
    const pool = { query } as unknown as Pool;

    const result = await deleteSavedJob(pool, "row-1", "uid-1");

    expect(result).toBe(false);
  });
});
