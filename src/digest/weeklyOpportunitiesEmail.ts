import { Pool } from "pg";
import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import { listUsersForWeeklyEmail } from "../db/users.repo";
import { env } from "../lib/env";
import { logger } from "../lib/logger";
import { buildMailTransport } from "../lib/mail";
import { DigestEmail } from "./savedSearchDigest";

dayjs.extend(advancedFormat);

const BGH_SCOUT_URL = "https://bghscout.com";
const BGH_LINKEDIN_GROUP_URL = "https://www.linkedin.com/groups/40962102/";

const getFirstName = (displayName: string | null): string | null =>
  displayName?.trim().split(/\s+/)[0] || null;

export const buildWeeklyOpportunitiesEmail = (
  displayName: string | null,
  now: dayjs.Dayjs = dayjs(),
): DigestEmail => {
  const firstName = getFirstName(displayName);
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const weekDate = now.format("MMMM Do");

  const subject = `Start ${weekDate} With New Opportunities`;

  const html = `
    <p>${greeting}</p>
    <p>Start your ${weekDate} by discovering new opportunities on BGH Scout!</p>
    <p>Whether you're actively looking for your next opportunity or simply keeping an eye on what's available, BGH Scout makes it easy to search and discover opportunities that match what you're looking for.</p>
    <p>Start searching today:<br>
    <a href="${BGH_SCOUT_URL}">Visit BGH Scout</a></p>
    <p>Don't miss what's new, start your week with BGH Scout!</p>
    <p>Want to learn more about everything BGH Scout offers? Join the <a href="${BGH_LINKEDIN_GROUP_URL}">BGH LinkedIn Group</a> to stay up to date on all our features.</p>
    <p>Thanks,</p>
    <p>BGH Scout Team</p>
  `.trim();

  const text = [
    greeting,
    "",
    `Start your ${weekDate} by discovering new opportunities on BGH Scout!`,
    "",
    "Whether you're actively looking for your next opportunity or simply keeping an eye on what's available, BGH Scout makes it easy to search and discover opportunities that match what you're looking for.",
    "",
    "🔎 Start searching today:",
    `Visit BGH Scout: ${BGH_SCOUT_URL}`,
    "",
    "Don't miss what's new—start your week with BGH Scout!",
    "",
    `Want to learn more about everything BGH Scout offers? Join the BGH LinkedIn Group to stay up to date on all our features: ${BGH_LINKEDIN_GROUP_URL}`,
    "",
    "Thanks,",
    "BGH Scout Team",
  ].join("\n");

  return { subject, html, text };
};

export const runWeeklyOpportunitiesEmail = async (
  pool: Pool,
): Promise<void> => {
  const users = await listUsersForWeeklyEmail(pool);

  if (!users.length) {
    return;
  }

  const transport = buildMailTransport();
  const now = dayjs();

  for (const user of users) {
    try {
      const email = buildWeeklyOpportunitiesEmail(user.display_name, now);

      await transport.sendMail({
        from: env.SENDER_EMAIL,
        to: user.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (err) {
      logger.error(
        `Failed to send weekly opportunities email to ${user.email}`,
        err,
      );
    }
  }
};
