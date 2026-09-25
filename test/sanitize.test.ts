import { describe, expect, it } from "vitest";
import { sanitizeDescription, sanitizePlainText } from "../src/ingest/sanitize";

describe("sanitizeDescription", () => {
  it("strips <script> tags", () => {
    const html = '<p>Join us</p><script>alert("xss")</script>';

    expect(sanitizeDescription(html)).not.toContain("<script>");
    expect(sanitizeDescription(html)).toContain("<p>Join us</p>");
  });

  it("strips event handler attributes like onerror", () => {
    const html = '<img src="x" onerror="alert(1)">';

    const result = sanitizeDescription(html);

    expect(result).not.toContain("onerror");
    expect(result).not.toContain("<img");
  });

  it("strips javascript: URLs from links", () => {
    const html = '<a href="javascript:alert(1)">click</a>';

    expect(sanitizeDescription(html)).not.toContain("javascript:");
  });

  it("keeps safe links and forces noopener/nofollow + target=_blank", () => {
    const html = '<a href="https://example.com">jobs</a>';

    const result = sanitizeDescription(html);

    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('rel="noopener nofollow"');
    expect(result).toContain('target="_blank"');
  });

  it("keeps allowed structural tags", () => {
    const html = "<ul><li>One</li><li>Two</li></ul>";

    expect(sanitizeDescription(html)).toBe(html);
  });
});

describe("sanitizePlainText", () => {
  it("strips all HTML down to text", () => {
    expect(sanitizePlainText("<b>Health</b> & <i>dental</i>")).toBe(
      "Health & dental",
    );
  });

  it("strips scripts entirely", () => {
    expect(sanitizePlainText("<script>alert(1)</script>Full-time")).toBe(
      "Full-time",
    );
  });
});
