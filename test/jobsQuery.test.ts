import { describe, expect, it } from "vitest";
import {
  buildBaseConditions,
  buildFullConditions,
  clampLimit,
  clampPage,
  JobsQueryInput,
  parseDay,
  sortClause,
  splitList,
} from "../src/db/jobsQuery";

const query = (over: Partial<JobsQueryInput> = {}): JobsQueryInput => ({
  activeSince: null,
  search: "",
  keyword: "",
  company: "",
  industry: "",
  date: "",
  exact: "",
  sort: "",
  ...over,
});

describe("parseDay", () => {
  it("parses slash and dash separated dates", () => {
    expect(parseDay("2026/09/08")).toBe("2026-09-08");
    expect(parseDay("2026-09-08")).toBe("2026-09-08");
    expect(parseDay("09/08/2026")).toBe("2026-09-08");
  });

  it("returns null for empty or unparseable values", () => {
    expect(parseDay("")).toBeNull();
    expect(parseDay("not-a-date")).toBeNull();
  });
});

describe("splitList", () => {
  it("trims, lowercases, and drops empty entries", () => {
    expect(splitList(" Acme, Globex ,,Initech ")).toEqual([
      "acme",
      "globex",
      "initech",
    ]);
  });
});

describe("clampLimit / clampPage", () => {
  it("clamps limit between 1 and MAX_LIMIT, defaulting on junk", () => {
    expect(clampLimit(18)).toBe(18);
    expect(clampLimit(0)).toBe(18);
    expect(clampLimit(NaN)).toBe(18);
    expect(clampLimit(9999)).toBe(50);
    expect(clampLimit(-5)).toBe(18);
  });

  it("clamps page to at least 1, defaulting on junk", () => {
    expect(clampPage(3)).toBe(3);
    expect(clampPage(0)).toBe(1);
    expect(clampPage(NaN)).toBe(1);
    expect(clampPage(-1)).toBe(1);
  });
});

describe("sortClause", () => {
  it("maps known sort values", () => {
    expect(sortClause("a")).toBe("lower(role_name) ASC");
    expect(sortClause("z")).toBe("lower(role_name) DESC");
    expect(sortClause("least")).toBe("scrape_datetime ASC NULLS LAST");
    expect(sortClause("most")).toBe("scrape_datetime DESC NULLS LAST");
  });

  it("falls back to most-recent for unknown values", () => {
    expect(sortClause("nonsense")).toBe("scrape_datetime DESC NULLS LAST");
    expect(sortClause("")).toBe("scrape_datetime DESC NULLS LAST");
  });
});

describe("buildBaseConditions", () => {
  it("always requires an ok details_status", () => {
    const { clause, values } = buildBaseConditions(query());
    expect(clause).toBe("details_status = 'ok'");
    expect(values).toEqual([]);
  });

  it("adds last_seen_at when activeSince is set", () => {
    const { clause, values } = buildBaseConditions(
      query({ activeSince: "2026-09-10" }),
    );
    expect(clause).toContain("last_seen_at >= $1");
    expect(values).toEqual(["2026-09-10"]);
  });

  it("adds a substring search condition on role_name", () => {
    const { clause, values } = buildBaseConditions(
      query({ search: "  Engineer " }),
    );
    expect(clause).toContain("position($1 in lower(role_name)) > 0");
    expect(values).toEqual(["engineer"]);
  });

  it("adds an EXISTS clause for a comma-separated keyword list", () => {
    const { clause, values } = buildBaseConditions(
      query({ keyword: "senior,staff" }),
    );
    expect(clause).toContain("EXISTS (SELECT 1 FROM unnest($1::text[])");
    expect(values).toEqual([["senior", "staff"]]);
  });

  it("prefers exact over date when both are present", () => {
    const { clause, values } = buildBaseConditions(
      query({ date: "2026-09-01", exact: "2026-09-10" }),
    );
    expect(clause).toContain("date_trunc('day', scrape_datetime) = $1::date");
    expect(values).toEqual(["2026-09-10"]);
  });

  it("falls back to a >= date range when exact is absent or unparseable", () => {
    const { clause, values } = buildBaseConditions(
      query({ date: "2026-09-08" }),
    );
    expect(clause).toContain("date_trunc('day', scrape_datetime) >= $1::date");
    expect(values).toEqual(["2026-09-08"]);
  });

  it("ignores an unparseable date rather than filtering everything out", () => {
    const { clause, values } = buildBaseConditions(
      query({ date: "not-a-date" }),
    );
    expect(clause).toBe("details_status = 'ok'");
    expect(values).toEqual([]);
  });
});

describe("buildFullConditions", () => {
  it("adds company and industry on top of the base conditions", () => {
    const { clause, values } = buildFullConditions(
      query({
        search: "engineer",
        company: "Acme,Globex",
        industry: "Technology",
      }),
    );
    expect(clause).toContain("position($1 in lower(role_name)) > 0");
    expect(clause).toContain("lower(company) = ANY($2::text[])");
    expect(clause).toContain("lower(primary_industry) = ANY($3::text[])");
    expect(values).toEqual(["engineer", ["acme", "globex"], ["technology"]]);
  });

  it("matches base conditions when no company/industry filter is set", () => {
    const base = buildBaseConditions(query({ search: "engineer" }));
    const full = buildFullConditions(query({ search: "engineer" }));
    expect(full.clause).toBe(base.clause);
    expect(full.values).toEqual(base.values);
  });
});
