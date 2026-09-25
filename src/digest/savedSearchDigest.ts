import { Pool } from "pg";
import { countJobs } from "../db/jobs.repo";
import { JobsQueryInput } from "../db/jobsQuery";
import {
  listSavedSearchesForDigest,
  SavedSearchWithOwner,
} from "../db/savedSearches.repo";
import { getLastSuccessfulRun } from "../db/runs.repo";
import { env } from "../lib/env";
import { logger } from "../lib/logger";
import { buildMailTransport } from "../lib/mail";
import { UrlParams } from "../types";

const toJobsQueryInput = (
  params: UrlParams,
  activeSince: string | null,
): JobsQueryInput => ({
  activeSince,
  search: params.search ?? "",
  keyword: params.keyword ?? "",
  company: params.company ?? "",
  industry: params.industry ?? "",
  date: params.date ?? "",
  exact: params.exact ?? "",
  sort: params.sort ?? "",
});

export const buildSavedSearchUrl = (params: UrlParams): string => {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  const search = query.toString();
  return `${env.FRONTEND_BASE_URL}${search ? `/?${search}` : ""}`;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export interface SavedSearchResult {
  name: string;
  url: string;
  count: number;
}

export interface DigestEmail {
  subject: string;
  html: string;
  text: string;
}

export const buildDigestEmail = (
  displayName: string | null,
  results: SavedSearchResult[],
): DigestEmail => {
  const greeting = displayName ? `Hi ${displayName},` : "Hi,";
  const resultWord = (count: number) => (count === 1 ? "result" : "results");

  const html = `
    <p>${escapeHtml(greeting)}</p>
    <p>Here's how your saved searches are looking today:</p>
    <ul>
      ${results
        .map(
          (r) =>
            `<li><a href="${escapeHtml(r.url)}">${escapeHtml(r.name)}</a> — ${r.count} ${resultWord(r.count)}</li>`,
        )
        .join("\n      ")}
    </ul>
    <p>Thanks,</p>
    <p>BGH Scout Team</p>
  `.trim();

  const text = [
    greeting,
    "",
    "Here's how your saved searches are looking today:",
    "",
    ...results.map(
      (r) => `${r.name} (${r.url}) — ${r.count} ${resultWord(r.count)}`,
    ),
    "",
    "Thanks,",
    "BGH Scout Team",
  ].join("\n");

  return {
    subject: "Your saved search results — BGH Scout",
    html,
    text,
  };
};

const groupByUser = (rows: SavedSearchWithOwner[]) => {
  const byUid = new Map<
    string,
    {
      email: string;
      displayName: string | null;
      searches: SavedSearchWithOwner[];
    }
  >();

  for (const row of rows) {
    const existing = byUid.get(row.uid);
    if (existing) {
      existing.searches.push(row);
    } else {
      byUid.set(row.uid, {
        email: row.email,
        displayName: row.display_name,
        searches: [row],
      });
    }
  }

  return byUid;
};

export const runSavedSearchDigest = async (pool: Pool): Promise<void> => {
  const rows = await listSavedSearchesForDigest(pool);

  if (!rows.length) {
    return;
  }

  const lastRun = await getLastSuccessfulRun(pool);
  const activeSince = lastRun ? lastRun.started_at : null;
  const transport = buildMailTransport();

  for (const [uid, user] of groupByUser(rows)) {
    try {
      const results: SavedSearchResult[] = await Promise.all(
        user.searches.map(async (savedSearch) => ({
          name: savedSearch.name || "Saved search",
          url: buildSavedSearchUrl(savedSearch.params),
          count: await countJobs(
            pool,
            toJobsQueryInput(savedSearch.params, activeSince),
          ),
        })),
      );

      const email = buildDigestEmail(user.displayName, results);

      await transport.sendMail({
        from: env.SENDER_EMAIL,
        to: user.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (err) {
      logger.error(`Failed to send saved search digest to uid ${uid}`, err);
    }
  }
};
