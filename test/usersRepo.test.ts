import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  listUsersForWeeklyEmail,
  updateUserPartial,
} from "../src/db/users.repo";

const makeFakePool = (rows: unknown[] = []) => {
  const query = vi.fn(async () => ({ rows }));

  return { pool: { query } as unknown as Pool, query };
};

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
