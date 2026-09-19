import Papa from "papaparse";
import { env } from "../lib/env";
import { CsvRow } from "../types";

export const downloadCsv = async (): Promise<string> => {
  const res = await fetch(env.CSV_SOURCE_URL);

  if (!res.ok) {
    throw new Error(`Failed to download CSV: ${res.status}`);
  }

  return res.text();
};

export const parseCsv = (csv: string): CsvRow[] => {
  const result = Papa.parse<CsvRow>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  return result.data;
};

const normalizeRow = (row: CsvRow): CsvRow | null => {
  const link = row.Link?.trim();

  if (!link) {
    return null;
  }

  return {
    "Role Name": row["Role Name"]?.trim() || "",
    "Primary Industry": row["Primary Industry"]?.trim() || "",
    Scrape_DateTime: row.Scrape_DateTime?.trim() || "",
    Scrape_Date: row.Scrape_Date?.trim() || "",
    Company: row.Company?.trim() || "",
    Link: link,
  };
};

export const normalizeAndDedupeRows = (rows: CsvRow[]): CsvRow[] => {
  const byLink = new Map<string, CsvRow>();

  for (const raw of rows) {
    const row = normalizeRow(raw);

    if (!row) {
      continue;
    }

    const existing = byLink.get(row.Link);

    if (!existing || row.Scrape_DateTime > existing.Scrape_DateTime) {
      byLink.set(row.Link, row);
    }
  }

  return [...byLink.values()];
};

export const fetchAndNormalizeCsv = async (): Promise<CsvRow[]> => {
  const csv = await downloadCsv();
  const rows = parseCsv(csv);

  return normalizeAndDedupeRows(rows);
};
