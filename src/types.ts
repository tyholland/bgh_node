export interface CsvRow {
  "Role Name": string;
  "Primary Industry": string;
  Scrape_DateTime: string;
  Scrape_Date: string;
  Company: string;
  Link: string;
}

export type DetailsStatus = "pending" | "ok" | "not_found" | "failed";

export interface JobDetails {
  datePosted?: string;
  description?: string;
  employmentType?: string;
  jobLocation?: {
    address: {
      addressLocality: string;
    };
  };
  validThrough?: string;
  jobBenefits?: string;
}

export interface JobRow extends CsvRow {
  // Stable per-job id (md5(link), see migration 006_jobs_id.sql) — powers
  // the frontend's /jobs/[id] detail page and its JobPosting JSON-LD.
  id: string;
  Details?: JobDetails;
  // Only ever set on the single-job response (GET /v1/jobs/:id) — see
  // job_view_counts.repo.ts. Omitted from the list endpoint so browsing a
  // page of results never inflates a job's count, only visiting it does.
  viewCount?: number;
}

export interface JobsResponseMeta {
  generatedAt: string;
  sourceScrapedAt: string | null;
}

// A filterable value plus how many jobs currently match it.
export interface Facet {
  value: string;
  count: number;
}

export interface JobsResponse {
  meta: JobsResponseMeta;
  jobs: JobRow[];
  total: number;
  totalPages: number;
  page: number;
  companies: Facet[];
  industries: Facet[];
  scrapDates: string[];
}

export interface JobRecord {
  id: string;
  link: string;
  role_name: string;
  primary_industry: string | null;
  company: string | null;
  scrape_datetime: string | null;
  scrape_date: string | null;
  details: JobDetails | null;
  details_status: DetailsStatus;
  details_fetched_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
}

export interface IngestRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  rows_in: number | null;
  rows_enriched: number | null;
  rows_failed: number | null;
  error: string | null;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
  providerId: string;
}

export interface UserRecord {
  uid: string;
  email: string | null;
  display_name: string | null;
  phone_number: string | null;
  photo_url: string | null;
  provider_id: string;
  email_notifications: boolean;
  job_title: string | null;
  created_at: string;
  updated_at: string;
}

export interface UrlParams {
  search?: string;
  company?: string;
  date?: string;
  exact?: string;
  keyword?: string;
  industry?: string;
  sort?: string;
}

// Whether, and how often, a saved search emails its owner when new jobs
// match it. "off" is the default for every newly created search — opt-in,
// not opt-out. Existing rows from before this column existed were backfilled
// to "daily" (migration 009) so nobody already relying on the digest went
// silent when this shipped.
export type AlertFrequency = "off" | "daily" | "weekly";

export interface SavedSearchRecord {
  id: string;
  uid: string;
  name: string | null;
  params: UrlParams;
  alert_frequency: AlertFrequency;
  // null until this search's first alert run; the digest's watermark for
  // "new since when" (see jobsQuery's newSince).
  last_alerted_at: string | null;
  created_at: string;
}

export interface SavedJobRecord {
  id: string;
  uid: string;
  job_id: string;
  role_name: string;
  company: string | null;
  link: string;
  created_at: string;
}
