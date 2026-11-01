import dayjs from "dayjs";
import { Pool } from "pg";
import { countJobs, selectJobsPage } from "../db/jobs.repo";
import { JobsQueryInput } from "../db/jobsQuery";
import { getLastSuccessfulRun } from "../db/runs.repo";
import {
  listUsersDueForJobTitleMatch,
  markUsersJobTitleAlerted,
} from "../db/users.repo";
import { env } from "../lib/env";
import { logger } from "../lib/logger";
import { buildMailTransport } from "../lib/mail";
import { JobRecord } from "../types";
import {
  buildSavedSearchUrl,
  DigestEmail,
  JobPreview,
} from "./savedSearchDigest";

// How many matching jobs to preview in the email — enough to be useful,
// small enough the email doesn't turn into a second job board.
const DIGEST_PREVIEW_LIMIT = 5;

const BGH_LINKEDIN_GROUP_URL = "https://www.linkedin.com/groups/40962102/";

const toJobsQueryInput = (
  jobTitle: string,
  activeSince: string | null,
  newSince: string | null,
): JobsQueryInput => ({
  activeSince,
  newSince,
  search: jobTitle,
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

export const buildJobTitleMatchEmail = (
  displayName: string | null,
  jobTitle: string,
  count: number,
  topJobs: JobPreview[],
): DigestEmail => {
  const greeting = displayName ? `Hi ${displayName},` : "Hi,";
  const resultWord = count === 1 ? "new job" : "new jobs";
  const searchUrl = buildSavedSearchUrl({ search: jobTitle });

  const jobPreviewHtml = topJobs.length
    ? `<ul>${topJobs
        .map(
          (job) =>
            `<li><a href="${escapeHtml(job.url)}">${escapeHtml(job.role)} at ${escapeHtml(job.company)}</a></li>`,
        )
        .join("")}</ul>`
    : "";

  const html = `
    <p>${escapeHtml(greeting)}</p>
    <p>There ${count === 1 ? "is" : "are"} <a href="${escapeHtml(searchUrl)}">${count} ${resultWord}</a> this week matching your job title, "${escapeHtml(jobTitle)}":</p>
    ${jobPreviewHtml}
    <p>Want to learn more about everything BGH Scout offers? Join the <a href="${BGH_LINKEDIN_GROUP_URL}">BGH LinkedIn Group</a> to stay up to date on all our features.</p>
    <p>Thanks,</p>
    <p>BGH Scout Team</p>
  `.trim();

  const jobPreviewText = topJobs.map(
    (job) => `  - ${job.role} at ${job.company} (${job.url})`,
  );

  const text = [
    greeting,
    "",
    `There ${count === 1 ? "is" : "are"} ${count} ${resultWord} this week matching your job title, "${jobTitle}": ${searchUrl}`,
    "",
    ...jobPreviewText,
    "",
    `Want to learn more about everything BGH Scout offers? Join the BGH LinkedIn Group to stay up to date on all our features: ${BGH_LINKEDIN_GROUP_URL}`,
    "",
    "Thanks,",
    "BGH Scout Team",
  ].join("\n");

  return {
    subject: `New jobs matching "${jobTitle}" — BGH Scout`,
    html,
    text,
  };
};

// Runs the weekly "jobs matching your job title" email: for every user with
// a job_title set who's due (listUsersDueForJobTitleMatch), finds postings
// matching that title first seen since the user's own job_title_alerted_at —
// falling back to a week ago for a user's very first email, so it's useful
// right away instead of near-empty — skips a user with nothing new rather
// than sending an empty result, and skips the send entirely (but still
// advances the watermark — see markUsersJobTitleAlerted) for a user who has
// opted out via email_notifications.
export const runJobTitleMatchEmail = async (pool: Pool): Promise<void> => {
  const users = await listUsersDueForJobTitleMatch(pool);

  if (!users.length) {
    return;
  }

  const lastRun = await getLastSuccessfulRun(pool);
  const activeSince = lastRun ? lastRun.started_at : null;
  const transport = buildMailTransport();
  const alertedUids: string[] = [];

  for (const user of users) {
    const newSince =
      user.job_title_alerted_at ?? dayjs().subtract(7, "day").toISOString();
    const queryInput = toJobsQueryInput(user.job_title, activeSince, newSince);

    try {
      const [count, topJobRecords] = await Promise.all([
        countJobs(pool, queryInput),
        selectJobsPage(pool, queryInput, 1, DIGEST_PREVIEW_LIMIT),
      ]);

      // Only a successful check advances the watermark — a query that
      // throws should be retried next cycle, not silently treated as
      // "nothing new."
      alertedUids.push(user.uid);

      if (count === 0 || !user.email_notifications) {
        continue;
      }

      const email = buildJobTitleMatchEmail(
        user.display_name,
        user.job_title,
        count,
        topJobRecords.map(toJobPreview),
      );

      await transport.sendMail({
        from: env.SENDER_EMAIL,
        to: user.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (err) {
      logger.error(
        `Failed to send job title match email to uid ${user.uid}`,
        err,
      );
    }
  }

  await markUsersJobTitleAlerted(pool, alertedUids);
};
