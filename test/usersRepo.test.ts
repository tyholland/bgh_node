import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  listUsersForWeeklyEmail,
  updateUserPartial,
  upsertUser,
} from "../src/db/users.repo";

const makeFakePool = (rows: unknown[] = []) => {
  const query = vi.fn(async () => ({ rows }));

  return { pool: { query } as unknown as Pool, query };
};

const profile = {
  uid: "uid-1",
  email: "a@example.com",
  displayName: "Alex",
  phoneNumber: null,
  photoURL: null,
  providerId: "password",
};

describe("upsertUser", () => {
  it("reports isNew when the INSERT ... ON CONFLICT DO NOTHING returns a row", async () => {
    const row = { uid: "uid-1" };
    const query = vi.fn(async () => ({ rows: [row] }));
    const pool = { query } as unknown as Pool;

    const result = await upsertUser(pool, profile);

    expect(result).toEqual({ user: row, isNew: true });
    // Only the INSERT ran — no fallback UPDATE needed.
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT (uid) DO NOTHING");
  });

  it("falls back to an UPDATE and reports isNew: false on conflict", async () => {
    const existingRow = { uid: "uid-1" };
    let call = 0;
    const query = vi.fn(async () => {
      call += 1;
      // First call (the INSERT) hits the conflict and returns no row;
      // second call (the fallback UPDATE) returns the existing row.
      return { rows: call === 1 ? [] : [existingRow] };
    });
    const pool = { query } as unknown as Pool;

    const result = await upsertUser(pool, profile);

    expect(result).toEqual({ user: existingRow, isNew: false });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain("UPDATE users_bgh SET");
  });
});

describe("updateUserPartial", () => {
  it("only sets the columns present in the patch", async () => {
    const { pool, query } = makeFakePool([{ uid: "uid-1" }]);

    await updateUserPartial(pool, "uid-1", { emailNotifications: false });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0];

    expect(sql).toContain("email_notifications = $2");
    expect(sql).not.toContain("display_name");
    expect(sql).not.toContain("email =");
    expect(values).toEqual(["uid-1", false]);
  });

  it("merges multiple fields in one statement", async () => {
    const { pool, query } = makeFakePool([{ uid: "uid-1" }]);

    await updateUserPartial(pool, "uid-1", {
      displayName: "New Name",
      emailNotifications: true,
    });

    const [sql, values] = query.mock.calls[0];

    expect(sql).toContain("display_name = $2");
    expect(sql).toContain("email_notifications = $3");
    expect(values).toEqual(["uid-1", "New Name", true]);
  });

  it("issues no UPDATE and just re-reads the row when the patch is empty", async () => {
    const { pool, query } = makeFakePool([{ uid: "uid-1" }]);

    await updateUserPartial(pool, "uid-1", {});

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("SELECT * FROM users_bgh");
  });
});

describe("listUsersForWeeklyEmail", () => {
  it("only selects users who have not opted out of email notifications", async () => {
    const { pool, query } = makeFakePool([]);

    await listUsersForWeeklyEmail(pool);

    const [sql] = query.mock.calls[0];
    expect(sql).toContain("email_notifications = true");
  });
});
