import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/jobs.repo", () => ({ countJobs: vi.fn() }));
vi.mock("../src/db/savedSearches.repo", () => ({
  listSavedSearchesForDigest: vi.fn(),
}));
vi.mock("../src/db/runs.repo", () => ({ getLastSuccessfulRun: vi.fn() }));

const sendMail = vi.fn();
vi.mock("../src/lib/mail", () => ({
  buildMailTransport: () => ({ sendMail }),
}));

import { countJobs } from "../src/db/jobs.repo";
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
      { name: "Engineering roles", url: "https://x/?a=1", count: 3 },
    ]);

    expect(email.html).toContain("Hi Jamie,");
    expect(email.text).toContain("Hi Jamie,");
  });

  it("falls back to a generic greeting without a display name", () => {
    const email = buildDigestEmail(null, [
      { name: "Engineering roles", url: "https://x/?a=1", count: 0 },
    ]);

    expect(email.html).toContain("Hi,");
  });

  it("links the saved search name and lists its result count", () => {
    const email = buildDigestEmail("Jamie", [
      { name: "Engineering roles", url: "https://x/?a=1", count: 1 },
    ]);

    expect(email.html).toContain(
      '<a href="https://x/?a=1">Engineering roles</a>',
    );
    expect(email.html).toContain("1 result<");
    expect(email.html).not.toContain("1 results");
  });

  it("escapes user-controlled values in the HTML body", () => {
    const email = buildDigestEmail("<script>alert(1)</script>", [
      { name: "<b>xss</b>", url: "https://x/?a=1", count: 2 },
    ]);

    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>xss</b>");
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
