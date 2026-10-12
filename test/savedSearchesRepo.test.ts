import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  insertSavedSearch,
  listDueSavedSearches,
  markSavedSearchesAlerted,
  unsubscribeSavedSearch,
  updateSavedSearchAlertFrequency,
} from "../src/db/savedSearches.repo";

const makeFakePool = (rows: unknown[] = [], rowCount = rows.length) => {
  const query = vi.fn(async () => ({ rows, rowCount }));

  return { pool: { query } as unknown as Pool, query };
};

describe("insertSavedSearch", () => {
  it("inserts the given alert frequency alongside name and params", async () => {
    const { pool, query } = makeFakePool([{ id: "1" }]);

    await insertSavedSearch(
      pool,
      "uid-1",
      "My search",
      { search: "eng" },
      "daily",
    );

    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("INSERT INTO saved_searches");
    expect(sql).toContain("alert_frequency");
    expect(values).toEqual([
      "uid-1",
      "My search",
      JSON.stringify({ search: "eng" }),
      "daily",
    ]);
  });
});

describe("updateSavedSearchAlertFrequency", () => {
  it("scopes the UPDATE to both id and uid", async () => {
    const { pool, query } = makeFakePool([{ id: "1" }]);

    await updateSavedSearchAlertFrequency(pool, "search-1", "uid-1", "weekly");

    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("UPDATE saved_searches SET alert_frequency = $1");
    expect(sql).toContain("WHERE id = $2 AND uid = $3");
    expect(values).toEqual(["weekly", "search-1", "uid-1"]);
  });

  it("returns null when no row matches id + uid", async () => {
    const { pool } = makeFakePool([]);

    const result = await updateSavedSearchAlertFrequency(
      pool,
      "search-1",
      "uid-1",
      "weekly",
    );

    expect(result).toBeNull();
  });
});

describe("unsubscribeSavedSearch", () => {
  it("sets alert_frequency to off, scoped to id + unsubscribe_token", async () => {
    const { pool, query } = makeFakePool([], 1);

    const result = await unsubscribeSavedSearch(pool, "search-1", "tok-1");

    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("SET alert_frequency = 'off'");
    expect(sql).toContain("WHERE id = $1 AND unsubscribe_token = $2");
    expect(values).toEqual(["search-1", "tok-1"]);
    expect(result).toBe(true);
  });

  it("returns false when the id/token pair doesn't match", async () => {
    const { pool } = makeFakePool([], 0);

    const result = await unsubscribeSavedSearch(pool, "search-1", "wrong");

    expect(result).toBe(false);
  });
});

describe("listDueSavedSearches", () => {
  it("filters by the given frequency and requires an email on file", async () => {
    const { pool, query } = makeFakePool([]);

    await listDueSavedSearches(pool, "daily");

    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("WHERE s.alert_frequency = $1");
    expect(sql).toContain("u.email IS NOT NULL AND u.email <> ''");
    expect(sql).toContain("1 day");
    expect(values).toEqual(["daily"]);
  });

  it("does not filter by email_notifications in SQL — the digest gates the send, not the selection", async () => {
    const { pool, query } = makeFakePool([]);

    await listDueSavedSearches(pool, "weekly");

    const [sql] = query.mock.calls[0];
    expect(sql).not.toContain("email_notifications = true");
    expect(sql).toContain("7 days");
  });
});

describe("markSavedSearchesAlerted", () => {
  it("updates last_alerted_at for every given id", async () => {
    const { pool, query } = makeFakePool([]);

    await markSavedSearchesAlerted(pool, ["1", "2"]);

    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("SET last_alerted_at = now()");
    expect(sql).toContain("WHERE id = ANY($1::uuid[])");
    expect(values).toEqual([["1", "2"]]);
  });

  it("issues no query for an empty list", async () => {
    const { pool, query } = makeFakePool([]);

    await markSavedSearchesAlerted(pool, []);

    expect(query).not.toHaveBeenCalled();
  });
});
