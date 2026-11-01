import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  deleteSavedJob,
  insertSavedJob,
  listDueSavedJobs,
  listSavedJobsByUid,
  markSavedJobsAlerted,
  unsubscribeSavedJob,
  updateSavedJobAlertFrequency,
} from "../src/db/savedJobs.repo";

const makeFakePool = (resultsByCall: unknown[][]) => {
  let call = 0;
  const query = vi.fn(async () => ({ rows: resultsByCall[call++] ?? [] }));

  return { pool: { query } as unknown as Pool, query };
};

const makeFakePoolWithCount = (
  rows: unknown[] = [],
  rowCount = rows.length,
) => {
  const query = vi.fn(async () => ({ rows, rowCount }));

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
      alertFrequency: "off",
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
      alertFrequency: "off",
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
      alertFrequency: "off",
    });

    const [, values] = query.mock.calls[0];
    expect(values).toEqual([
      "uid-1",
      "abc123",
      "Backend Engineer",
      null,
      "https://x",
      "off",
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

describe("updateSavedJobAlertFrequency", () => {
  it("scopes the UPDATE to both id and uid", async () => {
    const { pool, query } = makeFakePoolWithCount([{ id: "1" }]);

    await updateSavedJobAlertFrequency(pool, "job-1", "uid-1", "daily");

    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("UPDATE saved_jobs SET alert_frequency = $1");
    expect(sql).toContain("WHERE id = $2 AND uid = $3");
    expect(values).toEqual(["daily", "job-1", "uid-1"]);
  });

  it("returns null when no row matches id + uid", async () => {
    const { pool } = makeFakePoolWithCount([]);

    const result = await updateSavedJobAlertFrequency(
      pool,
      "job-1",
      "uid-1",
      "daily",
    );

    expect(result).toBeNull();
  });
});

describe("unsubscribeSavedJob", () => {
  it("sets alert_frequency to off, scoped to id + unsubscribe_token", async () => {
    const { pool, query } = makeFakePoolWithCount([], 1);

    const result = await unsubscribeSavedJob(pool, "job-1", "tok-1");

    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("SET alert_frequency = 'off'");
    expect(sql).toContain("WHERE id = $1 AND unsubscribe_token = $2");
    expect(values).toEqual(["job-1", "tok-1"]);
    expect(result).toBe(true);
  });

  it("returns false when the id/token pair doesn't match", async () => {
    const { pool } = makeFakePoolWithCount([], 0);

    const result = await unsubscribeSavedJob(pool, "job-1", "wrong");

    expect(result).toBe(false);
  });
});

describe("listDueSavedJobs", () => {
  it("filters by daily alert_frequency, a non-empty role_name, and requires an email on file", async () => {
    const { pool, query } = makeFakePoolWithCount([]);

    await listDueSavedJobs(pool);

    const [sql] = query.mock.calls[0];
    expect(sql).toContain("j.alert_frequency = 'daily'");
    expect(sql).toContain("trim(j.role_name) <> ''");
    expect(sql).toContain("u.email IS NOT NULL AND u.email <> ''");
    expect(sql).toContain("1 day");
  });

  it("does not filter by email_notifications in SQL — the digest gates the send, not the selection", async () => {
    const { pool, query } = makeFakePoolWithCount([]);

    await listDueSavedJobs(pool);

    const [sql] = query.mock.calls[0];
    expect(sql).not.toContain("email_notifications = true");
  });
});

describe("markSavedJobsAlerted", () => {
  it("updates last_alerted_at for every given id", async () => {
    const { pool, query } = makeFakePoolWithCount([]);

    await markSavedJobsAlerted(pool, ["1", "2"]);

    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("SET last_alerted_at = now()");
    expect(sql).toContain("WHERE id = ANY($1::uuid[])");
    expect(values).toEqual([["1", "2"]]);
  });

  it("issues no query for an empty list", async () => {
    const { pool, query } = makeFakePoolWithCount([]);

    await markSavedJobsAlerted(pool, []);

    expect(query).not.toHaveBeenCalled();
  });
});
