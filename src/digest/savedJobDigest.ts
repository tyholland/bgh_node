import { Pool } from "pg";
import { countJobs, selectJobsPage } from "../db/jobs.repo";
import { JobsQueryInput } from "../db/jobsQuery";
import {
  listDueSavedJobs,
  markSavedJobsAlerted,
  SavedJobForDigest,
} from "../db/savedJobs.repo";
import { getLastSuccessfulRun } from "../db/runs.repo";
import { env } from "../lib/env";
import { logger } from "../lib/logger";
import { buildMailTransport } from "../lib/mail";
import { JobRecord } from "../types";
import { DigestEmail, JobPreview } from "./savedSearchDigest";

// How many matching jobs to preview per saved job in the digest.
const DIGEST_PREVIEW_LIMIT = 5;

const BGH_LINKEDIN_GROUP_URL = "https://www.linkedin.com/groups/40962102/";

const toJobsQueryInput = (
  roleName: string,
  activeSince: string | null,
  newSince: string | null,
): JobsQueryInput => ({
  activeSince,
  newSince,
  search: roleName,
  keyword: "",
  company: "",
  industry: "",
  date: "",
  exact: "",
  sort: "",
});

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toJobPreview = (record: JobRecord): JobPreview => ({
  role: record.role_name,
  company: record.company || "",
  url: `${env.FRONTEND_BASE_URL}/jobs/${record.id}`,
});

export interface SavedJobResult {
  roleName: string;
  company: string | null;
  jobUrl: string;
  count: number;
  topJobs: JobPreview[];
  unsubscribeUrl: string;
}

export const buildUnsubscribeUrl = (
  savedJobId: string,
  unsubscribeToken: string,
): string =>
  `${env.API_BASE_URL}/v1/saved-jobs/${savedJobId}/unsubscribe?token=${unsubscribeToken}`;

export const buildSavedJobDigestEmail = (
  displayName: string | null,
  results: SavedJobResult[],
): DigestEmail => {
  const greeting = displayName ? `Hi ${displayName},` : "Hi,";
  const resultWord = (count: number) => (count === 1 ? "match" : "matches");

  const jobPreviewHtml = (jobs: JobPreview[]) =>
    jobs.length
      ? `<ul>${jobs
          .map(
            (job) =>
              `<li><a href="${escapeHtml(job.url)}">${escapeHtml(job.role)} at ${escapeHtml(job.company)}</a></li>`,
          )
          .join("")}</ul>`
      : "";

  const html = `
    <p>${escapeHtml(greeting)}</p>
    <p>Here's what's new for your saved jobs:</p>
    <ul>
      ${results
        .map(
          (r) =>
            `<li><a href="${escapeHtml(r.jobUrl)}">${escapeHtml(r.roleName)}${r.company ? ` at ${escapeHtml(r.company)}` : ""}</a> — ${r.count} new similar ${resultWord(r.count)} (<a href="${escapeHtml(r.unsubscribeUrl)}">unsubscribe from this alert</a>)${jobPreviewHtml(r.topJobs)}</li>`,
        )
        .join("\n      ")}
    </ul>
    <p>Want to learn more about everything BGH Scout offers? Join the <a href="${BGH_LINKEDIN_GROUP_URL}">BGH LinkedIn Group</a> to stay up to date on all our features.</p>
    <p>Thanks,</p>
    <p>BGH Scout Team</p>
  `.trim();

  const jobPreviewText = (jobs: JobPreview[]) =>
    jobs.map((job) => `  - ${job.role} at ${job.company} (${job.url})`);

  const text = [
    greeting,
    "",
    "Here's what's new for your saved jobs:",
    "",
    ...results.flatMap((r) => [
      `${r.roleName}${r.company ? ` at ${r.company}` : ""} (${r.jobUrl}) — ${r.count} new similar ${resultWord(r.count)} (unsubscribe: ${r.unsubscribeUrl})`,
      ...jobPreviewText(r.topJobs),
    ]),
    "",
    `Want to learn more about everything BGH Scout offers? Join the BGH LinkedIn Group to stay up to date on all our features: ${BGH_LINKEDIN_GROUP_URL}`,
    "",
    "Thanks,",
    "BGH Scout Team",
  ].join("\n");

  return {
    subject: "New jobs for your saved jobs — BGH Scout",
    html,
    text,
  };
};

const groupByUser = (rows: SavedJobForDigest[]) => {
  const byUid = new Map<
    string,
    {
      email: string;
      displayName: string | null;
      emailNotifications: boolean;
      jobs: SavedJobForDigest[];
    }
  >();

  for (const row of rows) {
    const existing = byUid.get(row.uid);
    if (existing) {
      existing.jobs.push(row);
    } else {
      byUid.set(row.uid, {
        email: row.email,
        displayName: row.display_name,
        emailNotifications: row.email_notifications,
        jobs: [row],
      });
    }
  }

  return byUid;
};

// Runs the daily saved-job alert digest: for every due saved job
// (listDueSavedJobs — alert_frequency = 'daily' and a non-empty role_name,
// i.e. a job title to search by), finds postings matching that title first
// seen since the saved job's own last_alerted_at (falling back to when it
// was saved, for its very first alert), skips a saved job with nothing new
// rather than sending an empty result, and skips the send entirely (but
// still advances the watermark — see markSavedJobsAlerted) for a user who
// has opted out via email_notifications.
export const runSavedJobDigest = async (pool: Pool): Promise<void> => {
  const rows = await listDueSavedJobs(pool);

  if (!rows.length) {
    return;
  }

  const lastRun = await getLastSuccessfulRun(pool);
  const activeSince = lastRun ? lastRun.started_at : null;
  const transport = buildMailTransport();
  const alertedIds: string[] = [];

  for (const [uid, user] of groupByUser(rows)) {
    const results: SavedJobResult[] = [];

    for (const savedJob of user.jobs) {
      const newSince = savedJob.last_alerted_at ?? savedJob.created_at;
      const queryInput = toJobsQueryInput(
        savedJob.role_name,
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
        alertedIds.push(savedJob.id);

        if (count > 0) {
          results.push({
            roleName: savedJob.role_name,
            company: savedJob.company,
            jobUrl: `${env.FRONTEND_BASE_URL}/jobs/${savedJob.job_id}`,
            unsubscribeUrl: buildUnsubscribeUrl(
              savedJob.id,
              savedJob.unsubscribe_token,
            ),
            count,
            topJobs: topJobRecords.map(toJobPreview),
          });
        }
      } catch (err) {
        logger.error(
          `Failed to evaluate saved job ${savedJob.id} for uid ${uid}`,
          err,
        );
      }
    }

    if (!results.length || !user.emailNotifications) {
      continue;
    }

    try {
      const email = buildSavedJobDigestEmail(user.displayName, results);

      await transport.sendMail({
        from: env.SENDER_EMAIL,
        to: user.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (err) {
      logger.error(`Failed to send saved job digest to uid ${uid}`, err);
    }
  }

  await markSavedJobsAlerted(pool, alertedIds);
};
