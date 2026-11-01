import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
vi.mock("../src/lib/mail", () => ({
  buildMailTransport: () => ({ sendMail }),
}));

import {
  buildWelcomeEmail,
  sendWelcomeEmail,
} from "../src/digest/welcomeEmail";

describe("buildWelcomeEmail", () => {
  it("greets the user by display name when present", () => {
    const email = buildWelcomeEmail("Jamie");

    expect(email.html).toContain("Hi Jamie,");
    expect(email.text).toContain("Hi Jamie,");
  });

  it("falls back to a generic greeting without a display name", () => {
    const email = buildWelcomeEmail(null);

    expect(email.html).toContain("Hi,");
  });

  it("has a welcoming subject", () => {
    const email = buildWelcomeEmail("Jamie");

    expect(email.subject).toBe("Welcome to BGH Scout!");
  });

  it("links the LinkedIn group for news and feature updates", () => {
    const email = buildWelcomeEmail("Jamie");

    expect(email.html).toContain(
      '<a href="https://www.linkedin.com/groups/40962102/">BGH Scout LinkedIn Group</a>',
    );
    expect(email.text).toContain("https://www.linkedin.com/groups/40962102/");
  });

  it("mentions adding a job title for job-title-matched alerts", () => {
    const email = buildWelcomeEmail("Jamie");

    expect(email.html).toContain("Add a job title");
    expect(email.html).toContain("weekly email when new jobs match it");
  });

  it("mentions the saved searches feature", () => {
    const email = buildWelcomeEmail("Jamie");

    expect(email.html).toContain("Save a search");
    expect(email.html).toContain("daily or weekly email alerts");
  });

  it("mentions the saved jobs feature", () => {
    const email = buildWelcomeEmail("Jamie");

    expect(email.html).toContain("Save individual jobs");
    expect(email.html).toContain("daily alert");
  });

  it("ends with a thanks message from the BGH Scout Team", () => {
    const email = buildWelcomeEmail("Jamie");

    expect(email.html).toContain("<p>Thanks,</p>");
    expect(email.html).toContain("<p>BGH Scout Team</p>");
    expect(email.text.trim().endsWith("Thanks,\nBGH Scout Team")).toBe(true);
  });
});

describe("sendWelcomeEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the welcome email to the given address", async () => {
    await sendWelcomeEmail("a@example.com", "Jamie");

    expect(sendMail).toHaveBeenCalledTimes(1);
    const [message] = sendMail.mock.calls[0];
    expect(message.to).toBe("a@example.com");
    expect(message.subject).toBe("Welcome to BGH Scout!");
    expect(message.html).toContain("Hi Jamie,");
  });
});
