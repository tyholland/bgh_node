import { describe, expect, it } from "vitest";
import { normalizeAndDedupeRows, parseCsv } from "../src/ingest/csv";
import { CsvRow } from "../src/types";

const row = (overrides: Partial<CsvRow> = {}): CsvRow => ({
  "Role Name": "Engineer",
  "Primary Industry": "Technology",
  Scrape_DateTime: "2026-09-10 14:32:00",
  Scrape_Date: "2026/09/10",
  Company: "Acme",
  Link: "https://careers.acme.com/jobs/1",
  ...overrides,
});

describe("normalizeAndDedupeRows", () => {
  it("trims whitespace on every field", () => {
    const rows = normalizeAndDedupeRows([
      row({ "Role Name": "  Engineer  ", Company: " Acme " }),
    ]);

    expect(rows[0]["Role Name"]).toBe("Engineer");
    expect(rows[0].Company).toBe("Acme");
  });

  it("drops rows with no Link", () => {
    const rows = normalizeAndDedupeRows([row({ Link: "" }), row()]);

    expect(rows).toHaveLength(1);
  });

  it("dedupes by Link, keeping the row with the newest Scrape_DateTime", () => {
    const rows = normalizeAndDedupeRows([
      row({ Scrape_DateTime: "2026-09-10 09:00:00", Company: "Old" }),
      row({ Scrape_DateTime: "2026-09-10 15:00:00", Company: "New" }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].Company).toBe("New");
  });
});

describe("parseCsv", () => {
  it("parses with header row and skips empty lines", () => {
    const csv =
      "Role Name,Primary Industry,Scrape_DateTime,Scrape_Date,Company,Link\n" +
      "Engineer,Technology,2026-09-10 14:32:00,2026/09/10,Acme,https://careers.acme.com/jobs/1\n\n";

    const rows = parseCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0].Link).toBe("https://careers.acme.com/jobs/1");
  });
});
