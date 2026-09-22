import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

// Formats the scrape sheet / URL params are known to produce.
const DATE_FORMATS = ["YYYY/MM/DD", "YYYY-MM-DD", "MM/DD/YYYY", "MM-DD-YYYY"];

export const DEFAULT_LIMIT = 18;
export const MAX_LIMIT = 50;

export interface JobsQueryInput {
  activeSince: string | null;
  search: string;
  keyword: string;
  company: string;
  industry: string;
  date: string;
  exact: string;
  sort: string;
}

export const splitList = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

// Parses a value in any of DATE_FORMATS to a normalized "YYYY-MM-DD" string,
// or null if it's absent / unparseable — mirrors the frontend's old toDay().
export const parseDay = (value: string): string | null => {
  if (!value) return null;
  const parsed = dayjs(value, DATE_FORMATS);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : null;
};

export const clampLimit = (value: number): number =>
  Number.isFinite(value) && value > 0
    ? Math.min(MAX_LIMIT, Math.floor(value))
    : DEFAULT_LIMIT;

export const clampPage = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;

export const sortClause = (sort: string): string => {
  switch (sort) {
    case "a":
      return "lower(role_name) ASC";
    case "z":
      return "lower(role_name) DESC";
    case "least":
      return "scrape_datetime ASC NULLS LAST";
    case "most":
    default:
      return "scrape_datetime DESC NULLS LAST";
  }
};

export interface SqlConditions {
  clause: string;
  values: unknown[];
}

// Conditions shared by the page query, the count, and every facet query:
// everything except the company / industry selection itself, so facets stay
// usable while one of those filters is applied.
export const buildBaseConditions = (input: JobsQueryInput): SqlConditions => {
  const values: unknown[] = [];
  const conditions: string[] = ["details_status = 'ok'"];

  if (input.activeSince) {
    values.push(input.activeSince);
    conditions.push(`last_seen_at >= $${values.length}`);
  }

  if (input.search) {
    values.push(input.search.trim().toLowerCase());
    conditions.push(`position($${values.length} in lower(role_name)) > 0`);
  }

  if (input.keyword) {
    const wanted = splitList(input.keyword);
    if (wanted.length) {
      values.push(wanted);
      conditions.push(
        `EXISTS (SELECT 1 FROM unnest($${values.length}::text[]) kw WHERE position(kw in lower(role_name)) > 0)`,
      );
    }
  }

  const exactDay = parseDay(input.exact.trim().split("-").join("/"));
  if (exactDay) {
    values.push(exactDay);
    conditions.push(
      `date_trunc('day', scrape_datetime) = $${values.length}::date`,
    );
  } else {
    const startDay = parseDay(input.date.trim());
    if (startDay) {
      values.push(startDay);
      conditions.push(
        `date_trunc('day', scrape_datetime) >= $${values.length}::date`,
      );
    }
  }

  return { clause: conditions.join(" AND "), values };
};

// Base conditions plus the company / industry selection — used for the page
// query and the total count.
export const buildFullConditions = (input: JobsQueryInput): SqlConditions => {
  const base = buildBaseConditions(input);
  const conditions = [base.clause];
  const values = [...base.values];

  if (input.company) {
    const wanted = splitList(input.company);
    if (wanted.length) {
      values.push(wanted);
      conditions.push(`lower(company) = ANY($${values.length}::text[])`);
    }
  }

  if (input.industry) {
    const wanted = splitList(input.industry);
    if (wanted.length) {
      values.push(wanted);
      conditions.push(
        `lower(primary_industry) = ANY($${values.length}::text[])`,
      );
    }
  }

  return { clause: conditions.join(" AND "), values };
};
