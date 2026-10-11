import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/jobs.repo", () => ({
  countJobs: vi.fn(),
  selectJobsPage: vi.fn(),
}));
vi.mock("../src/db/savedSearches.repo", () => ({
  listSavedSearchesForDigest: vi.fn(),
}));
vi.mock("../src/db/runs.repo", () => ({ getLastSuccessfulRun: vi.fn() }));

const sendMail = vi.fn();
vi.mock("../src/lib/mail", () => ({
  buildMailTransport: () => ({ sendMail }),
}));

import { countJobs, selectJobsPage } from "../src/db/jobs.repo";
import { getLastSuccessfulRun } from "../src/db/runs.repo";
import { listSavedSearchesForDigest } from "../src/db/savedSearches.repo";
import {
  buildDigestEmail,
  buildSavedSearchUrl,
  runSavedSearchDigest,
} from "../src/digest/savedSearchDigest";
import type { SavedSearchWithOwner } from "../src/db/savedSearches.repo";

describe("buildSavedSearchUrl", () => {
  it("builds a bare URL when there are no params", () => {
    expect(buildSavedSearchUrl({})).toBe("https://www.bghscout.com");
  });

  it("includes only the params that are set", () => {
    const url = buildSavedSearchUrl({ keyword: "engineer", company: "" });
    expect(url).toBe("https://www.bghscout.com/?keyword=engineer");
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
        count: 0,
        topJobs: [],
      },
    ]);

    expect(email.html).toContain("Hi,");
  });

  it("links the saved search name and lists its result count", () => {
    const email = buildDigestEmail("Jamie", [
      {
        name: "Engineering roles",
        url: "https://x/?a=1",
        count: 1,
        topJobs: [],
      },
    ]);

    expect(email.html).toContain(
      '<a href="https://x/?a=1">Engineering roles</a>',
    );
    expect(email.html).toContain("1 result<");
    expect(email.html).not.toContain("1 results");
  });

  it("lists each previewed job under its saved search", () => {
    const email = buildDigestEmail("Jamie", [
      {
        name: "Engineering roles",
        url: "https://x/?a=1",
        count: 2,
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

  it("omits the nested job list when there are no previewed jobs", () => {
    const email = buildDigestEmail("Jamie", [
      {
        name: "Engineering roles",
        url: "https://x/?a=1",
        count: 0,
        topJobs: [],
      },
    ]);

    expect(email.html).not.toContain("<ul></ul>");
  });

  it("escapes user-controlled values in the HTML body", () => {
    const email = buildDigestEmail("<script>alert(1)</script>", [
      {
        name: "<b>xss</b>",
        url: "https://x/?a=1",
        count: 2,
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

  it("does nothing when no one has a saved search", async () => {
    vi.mocked(listSavedSearchesForDigest).mockResolvedValue([]);

    await runSavedSearchDigest({} as never);

    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends one email per user with all of their saved searches", async () => {
    const rows: SavedSearchWithOwner[] = [
      {
        id: "1",
        uid: "uid-1",
        name: "Engineering",
        params: { keyword: "engineer" },
        created_at: new Date().toISOString(),
        email: "a@example.com",
        display_name: "Alex",
      },
      {
        id: "2",
        uid: "uid-1",
        name: "Sales",
        params: { keyword: "sales" },
        created_at: new Date().toISOString(),
        email: "a@example.com",
        display_name: "Alex",
      },
      {
        id: "3",
        uid: "uid-2",
        name: null,
        params: {},
        created_at: new Date().toISOString(),
        email: "b@example.com",
        display_name: null,
      },
    ];
    vi.mocked(listSavedSearchesForDigest).mockResolvedValue(rows);
    vi.mocked(countJobs).mockResolvedValue(5);

    await runSavedSearchDigest({} as never);

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
  });

  it("includes previewed jobs for each saved search in the sent email", async () => {
    const rows: SavedSearchWithOwner[] = [
      {
        id: "1",
        uid: "uid-1",
        name: "Engineering",
        params: { keyword: "engineer" },
        created_at: new Date().toISOString(),
        email: "a@example.com",
        display_name: "Alex",
      },
    ];
    vi.mocked(listSavedSearchesForDigest).mockResolvedValue(rows);
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

    await runSavedSearchDigest({} as never);

    const call = sendMail.mock.calls.find((c) => c[0].to === "a@example.com");
    expect(call?.[0].html).toContain("Backend Engineer at Globex");
  });

  it("keeps sending to other users when one send fails", async () => {
    const rows: SavedSearchWithOwner[] = [
      {
        id: "1",
        uid: "uid-1",
        name: "Engineering",
        params: {},
        created_at: new Date().toISOString(),
        email: "a@example.com",
        display_name: "Alex",
      },
      {
        id: "2",
        uid: "uid-2",
        name: "Sales",
        params: {},
        created_at: new Date().toISOString(),
        email: "b@example.com",
        display_name: "Blair",
      },
    ];
    vi.mocked(listSavedSearchesForDigest).mockResolvedValue(rows);
    vi.mocked(countJobs).mockResolvedValue(0);
    sendMail.mockRejectedValueOnce(new Error("smtp down"));
    sendMail.mockResolvedValueOnce(undefined);

    await expect(runSavedSearchDigest({} as never)).resolves.toBeUndefined();

    expect(sendMail).toHaveBeenCalledTimes(2);
  });
});
