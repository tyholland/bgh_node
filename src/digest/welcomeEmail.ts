import { env } from "../lib/env";
import { buildMailTransport } from "../lib/mail";
import { DigestEmail } from "./savedSearchDigest";

const BGH_LINKEDIN_GROUP_URL = "https://www.linkedin.com/groups/40962102/";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Sent once, right after a new account is created (see postUsersHandler —
// gated on upsertUser's isNew, not on every sign-in). Walks through the
// features a brand new user wouldn't know about yet.
export const buildWelcomeEmail = (displayName: string | null): DigestEmail => {
  const greeting = displayName ? `Hi ${displayName},` : "Hi,";
  const accountUrl = `${env.FRONTEND_BASE_URL}/account`;

  const html = `
    <p>${escapeHtml(greeting)}</p>
    <p>Welcome to BGH Scout! Here's how to get the most out of it:</p>
    <ul>
      <li>Join the <a href="${BGH_LINKEDIN_GROUP_URL}">BGH Scout LinkedIn Group</a> for news and feature updates.</li>
      <li>Add a job title to <a href="${accountUrl}">your account</a> to get a weekly email when new jobs match it.</li>
      <li>Save a search and turn on daily or weekly email alerts so new matching jobs land in your inbox.</li>
      <li>Save individual jobs you're interested in and get a daily alert when similar new postings appear.</li>
    </ul>
    <p>Thanks,</p>
    <p>BGH Scout Team</p>
  `.trim();

  const text = [
    greeting,
    "",
    "Welcome to BGH Scout! Here's how to get the most out of it:",
    "",
    `- Join the BGH Scout LinkedIn Group for news and feature updates: ${BGH_LINKEDIN_GROUP_URL}`,
    `- Add a job title to your account to get a weekly email when new jobs match it: ${accountUrl}`,
    "- Save a search and turn on daily or weekly email alerts so new matching jobs land in your inbox.",
    "- Save individual jobs you're interested in and get a daily alert when similar new postings appear.",
    "",
    "Thanks,",
    "BGH Scout Team",
  ].join("\n");

  return {
    subject: "Welcome to BGH Scout!",
    html,
    text,
  };
};

export const sendWelcomeEmail = async (
  email: string,
  displayName: string | null,
): Promise<void> => {
  const transport = buildMailTransport();
  const message = buildWelcomeEmail(displayName);

  await transport.sendMail({
    from: env.SENDER_EMAIL,
    to: email,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
};
