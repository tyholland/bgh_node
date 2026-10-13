import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/jobs.repo", () => ({
  countJobs: vi.fn(),
  selectJobsPage: vi.fn(),
}));
vi.mock("../src/db/savedSearches.repo", () => ({
  listDueSavedSearches: vi.fn(),
  markSavedSearchesAlerted: vi.fn(),
}));
vi.mock("../src/db/runs.repo", () => ({ getLastSuccessfulRun: vi.fn() }));

const sendMail = vi.fn();
vi.mock("../src/lib/mail", () => ({
  buildMailTransport: () => ({ sendMail }),
}));

import { countJobs, selectJobsPage } from "../src/db/jobs.repo";
import { getLastSuccessfulRun } from "../src/db/runs.repo";
import {
  listDueSavedSearches,
  markSavedSearchesAlerted,
} from "../src/db/savedSearches.repo";
import {
  buildDigestEmail,
  buildSavedSearchUrl,
  buildUnsubscribeUrl,
  runSavedSearchDigest,
} from "../src/digest/savedSearchDigest";
import type { SavedSearchForDigest } from "../src/db/savedSearches.repo";

const baseRow = (
  overrides: Partial<SavedSearchForDigest>,
): SavedSearchForDigest => ({
  id: "1",
  uid: "uid-1",
  name: "Engineering",
  params: {},
  alert_frequency: "daily",
  last_alerted_at: null,
  created_at: "2026-10-01T00:00:00.000Z",
  email: "a@example.com",
  display_name: "Alex",
  email_notifications: true,
  unsubscribe_token: "token-1",
  ...overrides,
});

describe("buildSavedSearchUrl", () => {
  it("builds a bare URL when there are no params", () => {
    expect(buildSavedSearchUrl({})).toBe("https://www.bghscout.com");
  });

  it("includes only the params that are set", () => {
    const url = buildSavedSearchUrl({ keyword: "engineer", company: "" });
    expect(url).toBe("https://www.bghscout.com/?keyword=engineer");
  });
});

describe("buildUnsubscribeUrl", () => {
  it("builds a link against the configured API_BASE_URL", () => {
    expect(buildUnsubscribeUrl("search-1", "token-1")).toBe(
      "https://api.bghscout.com/v1/saved-searches/search-1/unsubscribe?token=token-1",
    );
  });
});

describe("buildDigestEmail", () => {
  it("greets the user by display name when present", () => {
    const email = buildDigestEmail("Jamie", [
      {
        name: "Engineering roles",
        url: "https://x/?a=1",
        count: 3,
        topJobs: [],
        unsubscribeUrl: null,
      },
    ]);

    expect(email.html).toContain("Hi Jamie,");
    expect(email.text).toContain("Hi Jamie,");
  });

  it("falls back to a generic greeting without a display name", () => {
    const email = buildDigestEmail(null, [
      {
        name: "Engineering roles",
        url: "https://x/?a=1",
        count: 1,
        topJobs: [],
        unsubscribeUrl: null,
      },
    ]);

    expect(email.html).toContain("Hi,");
  });

  it("links the saved search name and lists its new result count", () => {
    const email = buildDigestEmail("Jamie", [
      {
        name: "Engineering roles",
        url: "https://x/?a=1",
        count: 1,
        topJobs: [],
        unsubscribeUrl: null,
      },
    ]);

    expect(email.html).toContain(
      '<a href="https://x/?a=1">Engineering roles</a>',
    );
    expect(email.html).toContain("1 new result<");
    expect(email.html).not.toContain("1 new results");
  });

  it("lists each previewed job under its saved search", () => {
    const email = buildDigestEmail("Jamie", [
      {
        name: "Engineering roles",
        url: "https://x/?a=1",
        count: 2,
        unsubscribeUrl: null,
        topJobs: [
          {
            role: "Backend Engineer",
            company: "Globex",
            url: "https://x/jobs/abc123",
          },
          {
            role: "Frontend Engineer",
            company: "Initech",
            url: "https://x/jobs/def456",
          },
        ],
      },
    ]);

    expect(email.html).toContain(
      '<a href="https://x/jobs/abc123">Backend Engineer at Globex</a>',
    );
    expect(email.html).toContain(
      '<a href="https://x/jobs/def456">Frontend Engineer at Initech</a>',
    );
    expect(email.text).toContain(
      "Backend Engineer at Globex (https://x/jobs/abc123)",
    );
  });

  it("includes an unsubscribe link for a result when one is given", () => {
    const email = buildDigestEmail("Jamie", [
      {
        name: "Engineering roles",
        url: "https://x/?a=1",
        count: 1,
        topJobs: [],
        unsubscribeUrl:
          "https://api.x/v1/saved-searches/1/unsubscribe?token=abc",
      },
    ]);

    expect(email.html).toContain(
      '<a href="https://api.x/v1/saved-searches/1/unsubscribe?token=abc">unsubscribe from this alert</a>',
    );
    expect(email.text).toContain(
      "unsubscribe: https://api.x/v1/saved-searches/1/unsubscribe?token=abc",
    );
  });

  it("omits the unsubscribe link entirely when none is given", () => {
    const email = buildDigestEmail("Jamie", [
      {
        name: "Engineering roles",
        url: "https://x/?a=1",
        count: 1,
        topJobs: [],
        unsubscribeUrl: null,
      },
    ]);

    expect(email.html).not.toContain("unsubscribe");
  });

  it("escapes user-controlled values in the HTML body", () => {
    const email = buildDigestEmail("<script>alert(1)</script>", [
      {
        name: "<b>xss</b>",
        url: "https://x/?a=1",
        count: 2,
        unsubscribeUrl: null,
        topJobs: [
          {
            role: "<i>role</i>",
            company: "<i>co</i>",
            url: "https://x/jobs/1",
          },
        ],
      },
    ]);

    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>xss</b>");
    expect(email.html).not.toContain("<i>role</i>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("ends with a thanks message from the BGH Scout Team", () => {
    const email = buildDigestEmail("Jamie", []);

    expect(email.html).toContain("<p>Thanks,</p>");
    expect(email.html).toContain("<p>BGH Scout Team</p>");
    expect(email.text.trim().endsWith("Thanks,\nBGH Scout Team")).toBe(true);
  });
});

describe("runSavedSearchDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLastSuccessfulRun).mockResolvedValue(null);
    vi.mocked(selectJobsPage).mockResolvedValue([]);
  });

  it("does nothing when no search of this frequency is due", async () => {
    vi.mocked(listDueSavedSearches).mockResolvedValue([]);

    await runSavedSearchDigest({} as never, "daily");

    expect(sendMail).not.toHaveBeenCalled();
    expect(markSavedSearchesAlerted).not.toHaveBeenCalled();
  });

  it("asks the repo for the requested frequency bucket", async () => {
    vi.mocked(listDueSavedSearches).mockResolvedValue([]);

    await runSavedSearchDigest({} as never, "weekly");

    expect(listDueSavedSearches).toHaveBeenCalledWith({}, "weekly");
  });

  it("skips a search with nothing new instead of emailing an empty result", async () => {
    vi.mocked(listDueSavedSearches).mockResolvedValue([baseRow({})]);
    vi.mocked(countJobs).mockResolvedValue(0);

    await runSavedSearchDigest({} as never, "daily");

    expect(sendMail).not.toHaveBeenCalled();
    // The watermark still advances — a quiet cycle isn't retried forever.
    expect(markSavedSearchesAlerted).toHaveBeenCalledWith({}, ["1"]);
  });

  it("sends one email per user covering only their searches with new matches", async () => {
    vi.mocked(listDueSavedSearches).mockResolvedValue([
      baseRow({
        id: "1",
        name: "Engineering",
        params: { keyword: "engineer" },
      }),
      baseRow({ id: "2", name: "Sales", params: { keyword: "sales" } }),
      baseRow({
        id: "3",
        uid: "uid-2",
        name: null,
        params: {},
        email: "b@example.com",
        display_name: null,
        unsubscribe_token: "token-3",
      }),
    ]);
    vi.mocked(countJobs).mockResolvedValue(5);

    await runSavedSearchDigest({} as never, "daily");

    expect(sendMail).toHaveBeenCalledTimes(2);

    const uid1Call = sendMail.mock.calls.find(
      (call) => call[0].to === "a@example.com",
    );
    expect(uid1Call?.[0].html).toContain("Engineering");
    expect(uid1Call?.[0].html).toContain("Sales");
    expect(uid1Call?.[0].html).toContain("Hi Alex,");

    const uid2Call = sendMail.mock.calls.find(
      (call) => call[0].to === "b@example.com",
    );
    expect(uid2Call?.[0].html).toContain("Saved search");

    expect(markSavedSearchesAlerted).toHaveBeenCalledWith({}, ["1", "2", "3"]);
  });

  it("filters jobs to first_seen since the search's own last_alerted_at", async () => {
    vi.mocked(listDueSavedSearches).mockResolvedValue([
      baseRow({ last_alerted_at: "2026-10-05T00:00:00.000Z" }),
    ]);
    vi.mocked(countJobs).mockResolvedValue(1);

    await runSavedSearchDigest({} as never, "daily");

    const [, queryInput] = vi.mocked(countJobs).mock.calls[0];
    expect(queryInput.newSince).toBe("2026-10-05T00:00:00.000Z");
  });

  it("falls back to created_at for a search's very first alert", async () => {
    vi.mocked(listDueSavedSearches).mockResolvedValue([
      baseRow({
        last_alerted_at: null,
        created_at: "2026-09-01T00:00:00.000Z",
      }),
    ]);
    vi.mocked(countJobs).mockResolvedValue(1);

    await runSavedSearchDigest({} as never, "daily");

    const [, queryInput] = vi.mocked(countJobs).mock.calls[0];
    expect(queryInput.newSince).toBe("2026-09-01T00:00:00.000Z");
  });

  it("includes previewed jobs for each saved search in the sent email", async () => {
    vi.mocked(listDueSavedSearches).mockResolvedValue([baseRow({})]);
    vi.mocked(countJobs).mockResolvedValue(1);
    vi.mocked(selectJobsPage).mockResolvedValue([
      {
        id: "abc123",
        link: "https://jobs.example/backend-engineer",
        role_name: "Backend Engineer",
        primary_industry: "Software",
        company: "Globex",
        scrape_datetime: new Date().toISOString(),
        scrape_date: "2026/10/10",
        details: null,
        details_status: "ok",
        details_fetched_at: null,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    await runSavedSearchDigest({} as never, "daily");

    const call = sendMail.mock.calls.find((c) => c[0].to === "a@example.com");
    expect(call?.[0].html).toContain("Backend Engineer at Globex");
  });

  it("skips the send but still advances the watermark when the user has opted out", async () => {
    vi.mocked(listDueSavedSearches).mockResolvedValue([
      baseRow({ email_notifications: false }),
    ]);
    vi.mocked(countJobs).mockResolvedValue(5);

    await runSavedSearchDigest({} as never, "daily");

    expect(sendMail).not.toHaveBeenCalled();
    expect(markSavedSearchesAlerted).toHaveBeenCalledWith({}, ["1"]);
  });

  it("does not advance the watermark for a search whose query throws", async () => {
    vi.mocked(listDueSavedSearches).mockResolvedValue([
      baseRow({ id: "1" }),
      baseRow({ id: "2", uid: "uid-2", email: "b@example.com" }),
    ]);
    vi.mocked(countJobs)
      .mockRejectedValueOnce(new Error("db timeout"))
      .mockResolvedValueOnce(1);

    await runSavedSearchDigest({} as never, "daily");

    expect(markSavedSearchesAlerted).toHaveBeenCalledWith({}, ["2"]);
  });

  it("keeps sending to other users when one send fails", async () => {
    vi.mocked(listDueSavedSearches).mockResolvedValue([
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

    await expect(
      runSavedSearchDigest({} as never, "daily"),
    ).resolves.toBeUndefined();

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(markSavedSearchesAlerted).toHaveBeenCalledWith({}, ["1", "2"]);
  });
});
