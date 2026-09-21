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
  Details?: JobDetails;
}

export interface JobsResponseMeta {
  generatedAt: string;
  sourceScrapedAt: string | null;
  total: number;
  enriched: number;
  enrichFailed: number;
}

export interface JobsResponse {
  meta: JobsResponseMeta;
  jobs: JobRow[];
}

export interface JobRecord {
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

export interface SavedSearchRecord {
  id: string;
  uid: string;
  name: string | null;
  params: UrlParams;
  created_at: string;
}
