import dayjs from "dayjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/jobs.repo", () => ({
  countJobs: vi.fn(),
  selectJobsPage: vi.fn(),
}));
vi.mock("../src/db/users.repo", () => ({
  listUsersDueForJobTitleMatch: vi.fn(),
  markUsersJobTitleAlerted: vi.fn(),
}));
vi.mock("../src/db/runs.repo", () => ({ getLastSuccessfulRun: vi.fn() }));

const sendMail = vi.fn();
vi.mock("../src/lib/mail", () => ({
  buildMailTransport: () => ({ sendMail }),
}));

import { countJobs, selectJobsPage } from "../src/db/jobs.repo";
import { getLastSuccessfulRun } from "../src/db/runs.repo";
import {
  listUsersDueForJobTitleMatch,
  markUsersJobTitleAlerted,
} from "../src/db/users.repo";
import type { UserDueForJobTitleMatch } from "../src/db/users.repo";
import {
  buildJobTitleMatchEmail,
  runJobTitleMatchEmail,
} from "../src/digest/jobTitleMatchEmail";

const baseUser = (
  overrides: Partial<UserDueForJobTitleMatch>,
): UserDueForJobTitleMatch => ({
  uid: "uid-1",
  email: "a@example.com",
  display_name: "Alex",
  job_title: "Backend Engineer",
  job_title_alerted_at: null,
  created_at: "2026-10-01T00:00:00.000Z",
  email_notifications: true,
  ...overrides,
});

describe("buildJobTitleMatchEmail", () => {
  it("greets the user by display name when present", () => {
    const email = buildJobTitleMatchEmail("Jamie", "Backend Engineer", 3, []);

    expect(email.html).toContain("Hi Jamie,");
    expect(email.text).toContain("Hi Jamie,");
  });

  it("falls back to a generic greeting without a display name", () => {
    const email = buildJobTitleMatchEmail(null, "Backend Engineer", 1, []);

    expect(email.html).toContain("Hi,");
  });

  it("mentions the job title and match count in the subject and body", () => {
    const email = buildJobTitleMatchEmail("Jamie", "Backend Engineer", 4, []);

    expect(email.subject).toContain("Backend Engineer");
    expect(email.html).toContain("4 new jobs");
    expect(email.html).toContain("Backend Engineer");
  });

  it("uses singular wording for a single match", () => {
    const email = buildJobTitleMatchEmail("Jamie", "Backend Engineer", 1, []);

    expect(email.html).toContain("1 new job<");
    expect(email.html).not.toContain("1 new jobs");
  });

  it("lists previewed jobs", () => {
    const email = buildJobTitleMatchEmail("Jamie", "Backend Engineer", 1, [
      {
        role: "Backend Engineer",
        company: "Globex",
        url: "https://x/jobs/abc123",
      },
    ]);

    expect(email.html).toContain(
      '<a href="https://x/jobs/abc123">Backend Engineer at Globex</a>',
    );
    expect(email.text).toContain(
      "Backend Engineer at Globex (https://x/jobs/abc123)",
    );
  });

  it("escapes user-controlled values in the HTML body", () => {
    const email = buildJobTitleMatchEmail(
      "<script>alert(1)</script>",
      "<b>xss</b>",
      1,
      [],
    );

    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>xss</b>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("ends with a thanks message from the BGH Scout Team", () => {
    const email = buildJobTitleMatchEmail("Jamie", "Backend Engineer", 1, []);

    expect(email.html).toContain("<p>Thanks,</p>");
    expect(email.html).toContain("<p>BGH Scout Team</p>");
    expect(email.text.trim().endsWith("Thanks,\nBGH Scout Team")).toBe(true);
  });
});

describe("runJobTitleMatchEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLastSuccessfulRun).mockResolvedValue(null);
    vi.mocked(selectJobsPage).mockResolvedValue([]);
  });

  it("does nothing when no user is due", async () => {
    vi.mocked(listUsersDueForJobTitleMatch).mockResolvedValue([]);

    await runJobTitleMatchEmail({} as never);

    expect(sendMail).not.toHaveBeenCalled();
    expect(markUsersJobTitleAlerted).not.toHaveBeenCalled();
  });

  it("skips a user with nothing new instead of emailing an empty result", async () => {
    vi.mocked(listUsersDueForJobTitleMatch).mockResolvedValue([baseUser({})]);
    vi.mocked(countJobs).mockResolvedValue(0);

    await runJobTitleMatchEmail({} as never);

    expect(sendMail).not.toHaveBeenCalled();
    // The watermark still advances — a quiet cycle isn't retried forever.
    expect(markUsersJobTitleAlerted).toHaveBeenCalledWith({}, ["uid-1"]);
  });

  it("sends one email per due user", async () => {
    vi.mocked(listUsersDueForJobTitleMatch).mockResolvedValue([
      baseUser({ uid: "uid-1", email: "a@example.com" }),
      baseUser({ uid: "uid-2", email: "b@example.com", display_name: null }),
    ]);
    vi.mocked(countJobs).mockResolvedValue(3);

    await runJobTitleMatchEmail({} as never);

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls.map((call) => call[0].to)).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    expect(markUsersJobTitleAlerted).toHaveBeenCalledWith({}, [
      "uid-1",
      "uid-2",
    ]);
  });

  it("searches by the user's job title", async () => {
    vi.mocked(listUsersDueForJobTitleMatch).mockResolvedValue([
      baseUser({ job_title: "Product Manager" }),
    ]);
    vi.mocked(countJobs).mockResolvedValue(1);

    await runJobTitleMatchEmail({} as never);

    const [, queryInput] = vi.mocked(countJobs).mock.calls[0];
    expect(queryInput.search).toBe("Product Manager");
  });

  it("filters jobs to first_seen since the user's own job_title_alerted_at", async () => {
    vi.mocked(listUsersDueForJobTitleMatch).mockResolvedValue([
      baseUser({ job_title_alerted_at: "2026-10-05T00:00:00.000Z" }),
    ]);
    vi.mocked(countJobs).mockResolvedValue(1);

    await runJobTitleMatchEmail({} as never);

    const [, queryInput] = vi.mocked(countJobs).mock.calls[0];
    expect(queryInput.newSince).toBe("2026-10-05T00:00:00.000Z");
  });

  it("falls back to a week ago for a user's very first email", async () => {
    vi.mocked(listUsersDueForJobTitleMatch).mockResolvedValue([
      baseUser({ job_title_alerted_at: null }),
    ]);
    vi.mocked(countJobs).mockResolvedValue(1);

    await runJobTitleMatchEmail({} as never);

    const [, queryInput] = vi.mocked(countJobs).mock.calls[0];
    const newSince = dayjs(queryInput.newSince as string);
    const expected = dayjs().subtract(7, "day");
    expect(Math.abs(newSince.diff(expected, "second"))).toBeLessThan(5);
  });

  it("skips the send but still advances the watermark when the user has opted out", async () => {
    vi.mocked(listUsersDueForJobTitleMatch).mockResolvedValue([
      baseUser({ email_notifications: false }),
    ]);
    vi.mocked(countJobs).mockResolvedValue(5);

    await runJobTitleMatchEmail({} as never);

    expect(sendMail).not.toHaveBeenCalled();
    expect(markUsersJobTitleAlerted).toHaveBeenCalledWith({}, ["uid-1"]);
  });

  it("does not advance the watermark for a user whose query throws", async () => {
    vi.mocked(listUsersDueForJobTitleMatch).mockResolvedValue([
      baseUser({ uid: "uid-1" }),
      baseUser({ uid: "uid-2", email: "b@example.com" }),
    ]);
    vi.mocked(countJobs)
      .mockRejectedValueOnce(new Error("db timeout"))
      .mockResolvedValueOnce(1);

    await runJobTitleMatchEmail({} as never);

    expect(markUsersJobTitleAlerted).toHaveBeenCalledWith({}, ["uid-2"]);
  });

  it("keeps sending to other users when one send fails", async () => {
    vi.mocked(listUsersDueForJobTitleMatch).mockResolvedValue([
      baseUser({ uid: "uid-1", email: "a@example.com" }),
      baseUser({ uid: "uid-2", email: "b@example.com", display_name: "Blair" }),
    ]);
    vi.mocked(countJobs).mockResolvedValue(1);
    sendMail.mockRejectedValueOnce(new Error("smtp down"));
    sendMail.mockResolvedValueOnce(undefined);

    await expect(runJobTitleMatchEmail({} as never)).resolves.toBeUndefined();

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(markUsersJobTitleAlerted).toHaveBeenCalledWith({}, [
      "uid-1",
      "uid-2",
    ]);
  });
});
