import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/jobs.repo", () => ({
  countJobs: vi.fn(),
  selectJobsPage: vi.fn(),
}));
vi.mock("../src/db/savedJobs.repo", () => ({
  listDueSavedJobs: vi.fn(),
  markSavedJobsAlerted: vi.fn(),
}));
vi.mock("../src/db/runs.repo", () => ({ getLastSuccessfulRun: vi.fn() }));

const sendMail = vi.fn();
vi.mock("../src/lib/mail", () => ({
  buildMailTransport: () => ({ sendMail }),
}));

import { countJobs, selectJobsPage } from "../src/db/jobs.repo";
import { getLastSuccessfulRun } from "../src/db/runs.repo";
import {
  listDueSavedJobs,
  markSavedJobsAlerted,
} from "../src/db/savedJobs.repo";
import {
  buildSavedJobDigestEmail,
  buildUnsubscribeUrl,
  runSavedJobDigest,
} from "../src/digest/savedJobDigest";
import type { SavedJobForDigest } from "../src/db/savedJobs.repo";

const baseRow = (overrides: Partial<SavedJobForDigest>): SavedJobForDigest => ({
  id: "1",
  uid: "uid-1",
  job_id: "abc123",
  role_name: "Backend Engineer",
  company: "Globex",
  link: "https://jobs.example/backend-engineer",
  alert_frequency: "daily",
  last_alerted_at: null,
  created_at: "2026-10-01T00:00:00.000Z",
  email: "a@example.com",
  display_name: "Alex",
  email_notifications: true,
  unsubscribe_token: "token-1",
  ...overrides,
});

describe("buildUnsubscribeUrl", () => {
  it("builds a link against the configured API_BASE_URL", () => {
    expect(buildUnsubscribeUrl("job-1", "token-1")).toBe(
      "https://api.bghscout.com/v1/saved-jobs/job-1/unsubscribe?token=token-1",
    );
  });
});

describe("buildSavedJobDigestEmail", () => {
  it("greets the user by display name when present", () => {
    const email = buildSavedJobDigestEmail("Jamie", [
      {
        roleName: "Backend Engineer",
        company: "Globex",
        jobUrl: "https://x/jobs/abc123",
        count: 3,
        topJobs: [],
        unsubscribeUrl: "https://x/unsub",
      },
    ]);

    expect(email.html).toContain("Hi Jamie,");
    expect(email.text).toContain("Hi Jamie,");
  });

  it("falls back to a generic greeting without a display name", () => {
    const email = buildSavedJobDigestEmail(null, [
      {
        roleName: "Backend Engineer",
        company: "Globex",
        jobUrl: "https://x/jobs/abc123",
        count: 1,
        topJobs: [],
        unsubscribeUrl: "https://x/unsub",
      },
    ]);

    expect(email.html).toContain("Hi,");
  });

  it("links the saved job and lists its new match count", () => {
    const email = buildSavedJobDigestEmail("Jamie", [
      {
        roleName: "Backend Engineer",
        company: "Globex",
        jobUrl: "https://x/jobs/abc123",
        count: 1,
        topJobs: [],
        unsubscribeUrl: "https://x/unsub",
      },
    ]);

    expect(email.html).toContain(
      '<a href="https://x/jobs/abc123">Backend Engineer at Globex</a>',
    );
    expect(email.html).toContain("1 new similar match (");
  });

  it("lists each previewed job under its saved job", () => {
    const email = buildSavedJobDigestEmail("Jamie", [
      {
        roleName: "Backend Engineer",
        company: "Globex",
        jobUrl: "https://x/jobs/abc123",
        count: 2,
        unsubscribeUrl: "https://x/unsub",
        topJobs: [
          {
            role: "Backend Engineer II",
            company: "Initech",
            url: "https://x/jobs/def456",
          },
        ],
      },
    ]);

    expect(email.html).toContain(
      '<a href="https://x/jobs/def456">Backend Engineer II at Initech</a>',
    );
    expect(email.text).toContain(
      "Backend Engineer II at Initech (https://x/jobs/def456)",
    );
  });

  it("includes an unsubscribe link for every result", () => {
    const email = buildSavedJobDigestEmail("Jamie", [
      {
        roleName: "Backend Engineer",
        company: "Globex",
        jobUrl: "https://x/jobs/abc123",
        count: 1,
        topJobs: [],
        unsubscribeUrl: "https://api.x/v1/saved-jobs/1/unsubscribe?token=abc",
      },
    ]);

    expect(email.html).toContain(
      '<a href="https://api.x/v1/saved-jobs/1/unsubscribe?token=abc">unsubscribe from this alert</a>',
    );
    expect(email.text).toContain(
      "unsubscribe: https://api.x/v1/saved-jobs/1/unsubscribe?token=abc",
    );
  });

  it("escapes user-controlled values in the HTML body", () => {
    const email = buildSavedJobDigestEmail("<script>alert(1)</script>", [
      {
        roleName: "<b>xss</b>",
        company: "<i>co</i>",
        jobUrl: "https://x/jobs/1",
        count: 1,
        unsubscribeUrl: "https://x/unsub",
        topJobs: [],
      },
    ]);

    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>xss</b>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("ends with a thanks message from the BGH Scout Team", () => {
    const email = buildSavedJobDigestEmail("Jamie", []);

    expect(email.html).toContain("<p>Thanks,</p>");
    expect(email.html).toContain("<p>BGH Scout Team</p>");
    expect(email.text.trim().endsWith("Thanks,\nBGH Scout Team")).toBe(true);
  });
});

describe("runSavedJobDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLastSuccessfulRun).mockResolvedValue(null);
    vi.mocked(selectJobsPage).mockResolvedValue([]);
  });

  it("does nothing when no saved job is due", async () => {
    vi.mocked(listDueSavedJobs).mockResolvedValue([]);

    await runSavedJobDigest({} as never);

    expect(sendMail).not.toHaveBeenCalled();
    expect(markSavedJobsAlerted).not.toHaveBeenCalled();
  });

  it("skips a saved job with nothing new instead of emailing an empty result", async () => {
    vi.mocked(listDueSavedJobs).mockResolvedValue([baseRow({})]);
    vi.mocked(countJobs).mockResolvedValue(0);

    await runSavedJobDigest({} as never);

    expect(sendMail).not.toHaveBeenCalled();
    // The watermark still advances — a quiet cycle isn't retried forever.
    expect(markSavedJobsAlerted).toHaveBeenCalledWith({}, ["1"]);
  });

  it("sends one email per user covering only their saved jobs with new matches", async () => {
    vi.mocked(listDueSavedJobs).mockResolvedValue([
      baseRow({ id: "1", role_name: "Backend Engineer" }),
      baseRow({ id: "2", role_name: "Sales Manager", job_id: "def456" }),
      baseRow({
        id: "3",
        uid: "uid-2",
        role_name: "Designer",
        email: "b@example.com",
        display_name: null,
        unsubscribe_token: "token-3",
      }),
    ]);
    vi.mocked(countJobs).mockResolvedValue(5);

    await runSavedJobDigest({} as never);

    expect(sendMail).toHaveBeenCalledTimes(2);

    const uid1Call = sendMail.mock.calls.find(
      (call) => call[0].to === "a@example.com",
    );
    expect(uid1Call?.[0].html).toContain("Backend Engineer");
    expect(uid1Call?.[0].html).toContain("Sales Manager");
    expect(uid1Call?.[0].html).toContain("Hi Alex,");

    const uid2Call = sendMail.mock.calls.find(
      (call) => call[0].to === "b@example.com",
    );
    expect(uid2Call?.[0].html).toContain("Designer");

    expect(markSavedJobsAlerted).toHaveBeenCalledWith({}, ["1", "2", "3"]);
  });

  it("searches by the saved job's role title", async () => {
    vi.mocked(listDueSavedJobs).mockResolvedValue([
      baseRow({ role_name: "Backend Engineer" }),
    ]);
    vi.mocked(countJobs).mockResolvedValue(1);

    await runSavedJobDigest({} as never);

    const [, queryInput] = vi.mocked(countJobs).mock.calls[0];
    expect(queryInput.search).toBe("Backend Engineer");
  });

  it("filters jobs to first_seen since the saved job's own last_alerted_at", async () => {
    vi.mocked(listDueSavedJobs).mockResolvedValue([
      baseRow({ last_alerted_at: "2026-10-05T00:00:00.000Z" }),
    ]);
    vi.mocked(countJobs).mockResolvedValue(1);

    await runSavedJobDigest({} as never);

    const [, queryInput] = vi.mocked(countJobs).mock.calls[0];
    expect(queryInput.newSince).toBe("2026-10-05T00:00:00.000Z");
  });

  it("falls back to created_at for a saved job's very first alert", async () => {
    vi.mocked(listDueSavedJobs).mockResolvedValue([
      baseRow({
        last_alerted_at: null,
        created_at: "2026-09-01T00:00:00.000Z",
      }),
    ]);
    vi.mocked(countJobs).mockResolvedValue(1);

    await runSavedJobDigest({} as never);

    const [, queryInput] = vi.mocked(countJobs).mock.calls[0];
    expect(queryInput.newSince).toBe("2026-09-01T00:00:00.000Z");
  });

  it("skips the send but still advances the watermark when the user has opted out", async () => {
    vi.mocked(listDueSavedJobs).mockResolvedValue([
      baseRow({ email_notifications: false }),
    ]);
    vi.mocked(countJobs).mockResolvedValue(5);

    await runSavedJobDigest({} as never);

    expect(sendMail).not.toHaveBeenCalled();
    expect(markSavedJobsAlerted).toHaveBeenCalledWith({}, ["1"]);
  });

  it("does not advance the watermark for a saved job whose query throws", async () => {
    vi.mocked(listDueSavedJobs).mockResolvedValue([
      baseRow({ id: "1" }),
      baseRow({ id: "2", uid: "uid-2", email: "b@example.com" }),
    ]);
    vi.mocked(countJobs)
      .mockRejectedValueOnce(new Error("db timeout"))
      .mockResolvedValueOnce(1);

    await runSavedJobDigest({} as never);

    expect(markSavedJobsAlerted).toHaveBeenCalledWith({}, ["2"]);
  });

  it("keeps sending to other users when one send fails", async () => {
    vi.mocked(listDueSavedJobs).mockResolvedValue([
      baseRow({ id: "1", uid: "uid-1", email: "a@example.com" }),
      baseRow({
        id: "2",
        uid: "uid-2",
        email: "b@example.com",
        display_name: "Blair",
      }),
    ]);
    vi.mocked(countJobs).mockResolvedValue(1);
    sendMail.mockRejectedValueOnce(new Error("smtp down"));
    sendMail.mockResolvedValueOnce(undefined);

    await expect(runSavedJobDigest({} as never)).resolves.toBeUndefined();

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(markSavedJobsAlerted).toHaveBeenCalledWith({}, ["1", "2"]);
  });
});
