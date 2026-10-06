import dayjs from "dayjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/users.repo", () => ({
  listUsersForWeeklyEmail: vi.fn(),
}));

const sendMail = vi.fn();
vi.mock("../src/lib/mail", () => ({
  buildMailTransport: () => ({ sendMail }),
}));

import { listUsersForWeeklyEmail } from "../src/db/users.repo";
import {
  buildSemiMonthlyUpdateEmail,
  isSemiMonthlyUpdateEmailDay,
  runSemiMonthlyUpdateEmail,
} from "../src/digest/semiMonthlyUpdateEmail";

const THE_15TH = dayjs("2026-09-15T10:00:00-04:00");
const LAST_DAY_30 = dayjs("2026-09-30T10:00:00-04:00");
const LAST_DAY_31 = dayjs("2026-10-31T10:00:00-04:00");
const MID_MONTH = dayjs("2026-09-20T10:00:00-04:00");

describe("isSemiMonthlyUpdateEmailDay", () => {
  it("is true on the 15th", () => {
    expect(isSemiMonthlyUpdateEmailDay(THE_15TH)).toBe(true);
  });

  it("is true on the last day of a 30-day month", () => {
    expect(isSemiMonthlyUpdateEmailDay(LAST_DAY_30)).toBe(true);
  });

  it("is true on the last day of a 31-day month", () => {
    expect(isSemiMonthlyUpdateEmailDay(LAST_DAY_31)).toBe(true);
  });

  it("is false on any other day", () => {
    expect(isSemiMonthlyUpdateEmailDay(MID_MONTH)).toBe(false);
  });
});

describe("buildSemiMonthlyUpdateEmail", () => {
  it("greets the user by first name when a display name is present", () => {
    const email = buildSemiMonthlyUpdateEmail("Jamie Rivera");

    expect(email.html).toContain("Hi Jamie,");
    expect(email.text).toContain("Hi Jamie,");
  });

  it("falls back to a generic greeting without a display name", () => {
    const email = buildSemiMonthlyUpdateEmail(null);

    expect(email.html).toContain("Hi,");
  });

  it("has the LinkedIn feature-update subject", () => {
    const email = buildSemiMonthlyUpdateEmail("Jamie");

    expect(email.subject).toBe("Your BGH Scout feature update is on LinkedIn");
  });

  it("links to the BGH Scout LinkedIn group", () => {
    const email = buildSemiMonthlyUpdateEmail("Jamie");

    expect(email.html).toContain(
      '<a href="https://www.linkedin.com/groups/40962102/">https://www.linkedin.com/groups/40962102/</a>',
    );
    expect(email.text).toContain("https://www.linkedin.com/groups/40962102/");
  });

  it("ends with a sign-off from the BGH Scout Team", () => {
    const email = buildSemiMonthlyUpdateEmail("Jamie");

    expect(email.text.trim().endsWith("Best,\nBGH Scout Team")).toBe(true);
  });
});

describe("runSemiMonthlyUpdateEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing on a day that isn't the 15th or the last day of the month", async () => {
    vi.mocked(listUsersForWeeklyEmail).mockResolvedValue([
      { email: "a@example.com", display_name: "Alex" },
    ]);

    await runSemiMonthlyUpdateEmail({} as never, MID_MONTH);

    expect(sendMail).not.toHaveBeenCalled();
  });

  it("does nothing when no user has an email on file", async () => {
    vi.mocked(listUsersForWeeklyEmail).mockResolvedValue([]);

    await runSemiMonthlyUpdateEmail({} as never, THE_15TH);

    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends one email per user on the 15th", async () => {
    vi.mocked(listUsersForWeeklyEmail).mockResolvedValue([
      { email: "a@example.com", display_name: "Alex" },
      { email: "b@example.com", display_name: null },
    ]);

    await runSemiMonthlyUpdateEmail({} as never, THE_15TH);

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls.map((call) => call[0].to)).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("sends one email per user on the last day of the month", async () => {
    vi.mocked(listUsersForWeeklyEmail).mockResolvedValue([
      { email: "a@example.com", display_name: "Alex" },
    ]);

    await runSemiMonthlyUpdateEmail({} as never, LAST_DAY_31);

    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("keeps sending to other users when one send fails", async () => {
    vi.mocked(listUsersForWeeklyEmail).mockResolvedValue([
      { email: "a@example.com", display_name: "Alex" },
      { email: "b@example.com", display_name: "Blair" },
    ]);
    sendMail.mockRejectedValueOnce(new Error("smtp down"));
    sendMail.mockResolvedValueOnce(undefined);

    await expect(
      runSemiMonthlyUpdateEmail({} as never, THE_15TH),
    ).resolves.toBeUndefined();

    expect(sendMail).toHaveBeenCalledTimes(2);
  });
});
