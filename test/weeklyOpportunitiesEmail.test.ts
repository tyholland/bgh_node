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
  buildWeeklyOpportunitiesEmail,
  runWeeklyOpportunitiesEmail,
} from "../src/digest/weeklyOpportunitiesEmail";

const MONDAY = dayjs("2026-09-21T10:00:00-04:00");

describe("buildWeeklyOpportunitiesEmail", () => {
  it("greets the user by first name when a display name is present", () => {
    const email = buildWeeklyOpportunitiesEmail("Jamie Rivera", MONDAY);

    expect(email.html).toContain("Hi Jamie,");
    expect(email.text).toContain("Hi Jamie,");
  });

  it("falls back to a generic greeting without a display name", () => {
    const email = buildWeeklyOpportunitiesEmail(null, MONDAY);

    expect(email.html).toContain("Hi,");
  });

  it("includes the formatted date of the current week in the subject and body", () => {
    const email = buildWeeklyOpportunitiesEmail("Jamie", MONDAY);

    expect(email.subject).toBe("Start September 21st With New Opportunities");
    expect(email.html).toContain("Start your September 21st by discovering");
    expect(email.text).toContain("Start your September 21st by discovering");
  });

  it("links to BGH Scout", () => {
    const email = buildWeeklyOpportunitiesEmail("Jamie", MONDAY);

    expect(email.html).toContain(
      '<a href="https://bghscout.com">Visit BGH Scout</a>',
    );
    expect(email.text).toContain("https://bghscout.com");
  });

  it("ends with a thanks message from the BGH Scout Team", () => {
    const email = buildWeeklyOpportunitiesEmail("Jamie", MONDAY);

    expect(email.text.trim().endsWith("Thanks,\nBGH Scout Team")).toBe(true);
  });
});

describe("runWeeklyOpportunitiesEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when no user has an email on file", async () => {
    vi.mocked(listUsersForWeeklyEmail).mockResolvedValue([]);

    await runWeeklyOpportunitiesEmail({} as never);

    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends one email per user", async () => {
    vi.mocked(listUsersForWeeklyEmail).mockResolvedValue([
      { email: "a@example.com", display_name: "Alex" },
      { email: "b@example.com", display_name: null },
    ]);

    await runWeeklyOpportunitiesEmail({} as never);

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls.map((call) => call[0].to)).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("keeps sending to other users when one send fails", async () => {
    vi.mocked(listUsersForWeeklyEmail).mockResolvedValue([
      { email: "a@example.com", display_name: "Alex" },
      { email: "b@example.com", display_name: "Blair" },
    ]);
    sendMail.mockRejectedValueOnce(new Error("smtp down"));
    sendMail.mockResolvedValueOnce(undefined);

    await expect(
      runWeeklyOpportunitiesEmail({} as never),
    ).resolves.toBeUndefined();

    expect(sendMail).toHaveBeenCalledTimes(2);
  });
});
