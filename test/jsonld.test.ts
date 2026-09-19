import { describe, expect, it } from "vitest";
import { extractJobDetails } from "../src/ingest/jsonld";

const wrap = (json: string) =>
  `<html><head><script type="application/ld+json">${json}</script></head><body></body></html>`;

describe("extractJobDetails", () => {
  it("maps a plain JobPosting node (Greenhouse/Lever style)", () => {
    const html = wrap(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "JobPosting",
        datePosted: "2026-09-08",
        validThrough: "2026-10-08",
        description: "<p>Great job</p>",
        employmentType: "FULL_TIME",
        jobLocation: {
          "@type": "Place",
          address: { "@type": "PostalAddress", addressLocality: "Boston, MA" },
        },
      }),
    );

    const details = extractJobDetails(html);

    expect(details).toEqual({
      datePosted: "2026-09-08",
      validThrough: "2026-10-08",
      description: "<p>Great job</p>",
      employmentType: "FULL_TIME",
      jobLocation: { address: { addressLocality: "Boston, MA" } },
    });
  });

  it("finds a JobPosting inside @graph", () => {
    const html = wrap(
      JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Organization", name: "Acme" },
          { "@type": "JobPosting", datePosted: "2026-01-01" },
        ],
      }),
    );

    expect(extractJobDetails(html)?.datePosted).toBe("2026-01-01");
  });

  it("finds a JobPosting when @type is an array", () => {
    const html = wrap(
      JSON.stringify({
        "@type": ["JobPosting", "Thing"],
        datePosted: "2026-02-02",
      }),
    );

    expect(extractJobDetails(html)?.datePosted).toBe("2026-02-02");
  });

  it("marks remote jobs via jobLocationType TELECOMMUTE", () => {
    const html = wrap(
      JSON.stringify({ "@type": "JobPosting", jobLocationType: "TELECOMMUTE" }),
    );

    expect(extractJobDetails(html)?.jobLocation).toEqual({
      address: { addressLocality: "Remote" },
    });
  });

  it("handles jobLocation and address given as arrays", () => {
    const html = wrap(
      JSON.stringify({
        "@type": "JobPosting",
        jobLocation: [{ address: [{ addressLocality: "Remote, US" }] }],
      }),
    );

    expect(extractJobDetails(html)?.jobLocation).toEqual({
      address: { addressLocality: "Remote, US" },
    });
  });

  it("joins array employmentType values", () => {
    const html = wrap(
      JSON.stringify({
        "@type": "JobPosting",
        employmentType: ["FULL_TIME", "CONTRACTOR"],
      }),
    );

    expect(extractJobDetails(html)?.employmentType).toBe(
      "FULL_TIME, CONTRACTOR",
    );
  });

  it("returns null when there is no JobPosting node", () => {
    const html = wrap(
      JSON.stringify({ "@type": "Organization", name: "Acme" }),
    );

    expect(extractJobDetails(html)).toBeNull();
  });

  it("returns null and does not throw when there is no JSON-LD at all", () => {
    const html = "<html><body><h1>Careers</h1></body></html>";

    expect(extractJobDetails(html)).toBeNull();
  });

  it("skips malformed JSON-LD blocks instead of throwing", () => {
    const html =
      `<html><head><script type="application/ld+json">{not valid json,}</script>` +
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "JobPosting",
        datePosted: "2026-03-03",
      })}</script></head><body></body></html>`;

    expect(extractJobDetails(html)?.datePosted).toBe("2026-03-03");
  });
});
