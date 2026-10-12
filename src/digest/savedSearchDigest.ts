import { Pool } from "pg";
import { countJobs, selectJobsPage } from "../db/jobs.repo";
import { JobsQueryInput } from "../db/jobsQuery";
import {
  listDueSavedSearches,
  markSavedSearchesAlerted,
  SavedSearchForDigest,
} from "../db/savedSearches.repo";
import { getLastSuccessfulRun } from "../db/runs.repo";
import { env } from "../lib/env";
import { logger } from "../lib/logger";
import { buildMailTransport } from "../lib/mail";
import { AlertFrequency, JobRecord, UrlParams } from "../types";

// How many matching jobs to preview per saved search in the digest — enough
// to be useful, small enough the email doesn't turn into a second job board.
const DIGEST_PREVIEW_LIMIT = 5;

const BGH_LINKEDIN_GROUP_URL = "https://www.linkedin.com/groups/40962102/";

const toJobsQueryInput = (
  params: UrlParams,
  activeSince: string | null,
  newSince: string | null,
): JobsQueryInput => ({
  activeSince,
  newSince,
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

// null when API_BASE_URL isn't configured — the digest just omits the
// unsubscribe line rather than emailing a broken link or failing the whole
// run over a nice-to-have.
export const buildUnsubscribeUrl = (
  savedSearchId: string,
  unsubscribeToken: string,
): string | null =>
  env.API_BASE_URL
    ? `${env.API_BASE_URL}/v1/saved-searches/${savedSearchId}/unsubscribe?token=${unsubscribeToken}`
    : null;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export interface JobPreview {
  role: string;
  company: string;
  url: string;
}

const toJobPreview = (record: JobRecord): JobPreview => ({
  role: record.role_name,
  company: record.company || "",
  url: `${env.FRONTEND_BASE_URL}/jobs/${record.id}`,
});

export interface SavedSearchResult {
  name: string;
  url: string;
  count: number;
  topJobs: JobPreview[];
  unsubscribeUrl: string | null;
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

  const jobPreviewHtml = (jobs: JobPreview[]) =>
    jobs.length
      ? `<ul>${jobs
          .map(
            (job) =>
              `<li><a href="${escapeHtml(job.url)}">${escapeHtml(job.role)} at ${escapeHtml(job.company)}</a></li>`,
          )
          .join("")}</ul>`
      : "";

  const unsubscribeHtml = (url: string | null) =>
    url
      ? ` (<a href="${escapeHtml(url)}">unsubscribe from this alert</a>)`
      : "";

  const html = `
    <p>${escapeHtml(greeting)}</p>
    <p>Here's what's new for your saved searches:</p>
    <ul>
      ${results
        .map(
          (r) =>
            `<li><a href="${escapeHtml(r.url)}">${escapeHtml(r.name)}</a> — ${r.count} new ${resultWord(r.count)}${unsubscribeHtml(r.unsubscribeUrl)}${jobPreviewHtml(r.topJobs)}</li>`,
        )
        .join("\n      ")}
    </ul>
    <p>Want to learn more about everything BGH Scout offers? Join the <a href="${BGH_LINKEDIN_GROUP_URL}">BGH LinkedIn Group</a> to stay up to date on all our features.</p>
    <p>Thanks,</p>
    <p>BGH Scout Team</p>
  `.trim();

  const jobPreviewText = (jobs: JobPreview[]) =>
    jobs.map((job) => `  - ${job.role} at ${job.company} (${job.url})`);

  const unsubscribeText = (url: string | null) =>
    url ? ` (unsubscribe: ${url})` : "";

  const text = [
    greeting,
    "",
    "Here's what's new for your saved searches:",
    "",
    ...results.flatMap((r) => [
      `${r.name} (${r.url}) — ${r.count} new ${resultWord(r.count)}${unsubscribeText(r.unsubscribeUrl)}`,
      ...jobPreviewText(r.topJobs),
    ]),
    "",
    `Want to learn more about everything BGH Scout offers? Join the BGH LinkedIn Group to stay up to date on all our features: ${BGH_LINKEDIN_GROUP_URL}`,
    "",
    "Thanks,",
    "BGH Scout Team",
  ].join("\n");

  return {
    subject: "New jobs for your saved searches — BGH Scout",
    html,
    text,
  };
};

const groupByUser = (rows: SavedSearchForDigest[]) => {
  const byUid = new Map<
    string,
    {
      email: string;
      displayName: string | null;
      emailNotifications: boolean;
      searches: SavedSearchForDigest[];
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
        emailNotifications: row.email_notifications,
        searches: [row],
      });
    }
  }

  return byUid;
};

// Runs one frequency bucket (daily or weekly) of the saved-search alert
// digest: for every due search (listDueSavedSearches), finds jobs first
// seen since that search's own last_alerted_at (falling back to when it was
// created, for its very first alert), skips a search with nothing new
// rather than sending an empty result, and skips the send entirely (but
// still advances the watermark — see markSavedSearchesAlerted) for a user
// who has opted out via email_notifications. See BACKEND_REPO_PLAN.md §5.
export const runSavedSearchDigest = async (
  pool: Pool,
  frequency: Exclude<AlertFrequency, "off">,
): Promise<void> => {
  const rows = await listDueSavedSearches(pool, frequency);

  if (!rows.length) {
    return;
  }

  const lastRun = await getLastSuccessfulRun(pool);
  const activeSince = lastRun ? lastRun.started_at : null;
  const transport = buildMailTransport();
  const alertedIds: string[] = [];

  for (const [uid, user] of groupByUser(rows)) {
    const results: SavedSearchResult[] = [];

    for (const savedSearch of user.searches) {
      const newSince = savedSearch.last_alerted_at ?? savedSearch.created_at;
      const queryInput = toJobsQueryInput(
        savedSearch.params,
        activeSince,
        newSince,
      );

      try {
        const [count, topJobRecords] = await Promise.all([
          countJobs(pool, queryInput),
          selectJobsPage(pool, queryInput, 1, DIGEST_PREVIEW_LIMIT),
        ]);

        // Only a successful check advances the watermark — a query that
        // throws should be retried next cycle, not silently treated as
        // "nothing new."
        alertedIds.push(savedSearch.id);

        if (count > 0) {
          results.push({
            name: savedSearch.name || "Saved search",
            url: buildSavedSearchUrl(savedSearch.params),
            unsubscribeUrl: buildUnsubscribeUrl(
              savedSearch.id,
              savedSearch.unsubscribe_token,
            ),
            count,
            topJobs: topJobRecords.map(toJobPreview),
          });
        }
      } catch (err) {
        logger.error(
          `Failed to evaluate saved search ${savedSearch.id} for uid ${uid}`,
          err,
        );
      }
    }

    if (!results.length || !user.emailNotifications) {
      continue;
    }

    try {
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

  await markSavedSearchesAlerted(pool, alertedIds);
};
