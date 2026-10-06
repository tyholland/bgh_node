import { Pool } from "pg";
import dayjs from "dayjs";
import { listUsersForWeeklyEmail } from "../db/users.repo";
import { env } from "../lib/env";
import { logger } from "../lib/logger";
import { buildMailTransport } from "../lib/mail";
import { DigestEmail } from "./savedSearchDigest";

const LINKEDIN_GROUP_URL = "https://www.linkedin.com/groups/40962102/";

const getFirstName = (displayName: string | null): string | null =>
  displayName?.trim().split(/\s+/)[0] || null;

// Cron runs daily; this narrows it to the 15th and the last calendar day of
// the month (which shifts between 28-31, so it can't be expressed in cron
// syntax alone).
export const isSemiMonthlyUpdateEmailDay = (
  now: dayjs.Dayjs = dayjs(),
): boolean => now.date() === 15 || now.date() === now.daysInMonth();

export const buildSemiMonthlyUpdateEmail = (
  displayName: string | null,
  now: dayjs.Dayjs = dayjs(),
): DigestEmail => {
  const firstName = getFirstName(displayName);
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const formattedDate = now.format("MMMM D, YYYY");

  const subject = "Your BGH Scout feature update is on LinkedIn";

  const html = `
    <p>${greeting}</p>
    <p>Thank you for using BGH Scout! In this semi-monthly update for ${formattedDate}, we want to point you to the best place to keep up with everything new.</p>
    <p>Our LinkedIn group is where we share all current and upcoming BGH Scout features. Join us here:<br>
    <a href="${LINKEDIN_GROUP_URL}">${LINKEDIN_GROUP_URL}</a></p>
    <p>Thanks again for being part of BGH Scout.</p>
    <p>Best,</p>
    <p>BGH Scout Team</p>
  `.trim();

  const text = [
    greeting,
    "",
    `Thank you for using BGH Scout! In this semi-monthly update for ${formattedDate}, we want to point you to the best place to keep up with everything new.`,
    "",
    "Our LinkedIn group is where we share all current and upcoming BGH Scout features. Join us here:",
    LINKEDIN_GROUP_URL,
    "",
    "Thanks again for being part of BGH Scout.",
    "",
    "Best,",
    "BGH Scout Team",
  ].join("\n");

  return { subject, html, text };
};

export const runSemiMonthlyUpdateEmail = async (
  pool: Pool,
  now: dayjs.Dayjs = dayjs(),
): Promise<void> => {
  if (!isSemiMonthlyUpdateEmailDay(now)) {
    return;
  }

  const users = await listUsersForWeeklyEmail(pool);

  if (!users.length) {
    return;
  }

  const transport = buildMailTransport();

  for (const user of users) {
    try {
      const email = buildSemiMonthlyUpdateEmail(user.display_name, now);

      await transport.sendMail({
        from: env.SENDER_EMAIL,
        to: user.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (err) {
      logger.error(
        `Failed to send semi-monthly update email to ${user.email}`,
        err,
      );
    }
  }
};
