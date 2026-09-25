import { env } from "../lib/env";
import { logger } from "../lib/logger";
import { DetailsStatus, JobDetails } from "../types";
import { extractJobDetails } from "./jsonld";
import { sanitizeDescription, sanitizePlainText } from "./sanitize";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

const lastRequestAtByHost = new Map<string, number>();

const throttlePerHost = async (link: string) => {
  let host: string;

  try {
    host = new URL(link).host;
  } catch {
    return;
  }

  const minGapMs = 200 + Math.random() * 300;
  const lastAt = lastRequestAtByHost.get(host) || 0;
  const wait = lastAt + minGapMs - Date.now();

  lastRequestAtByHost.set(host, Date.now() + Math.max(wait, 0));

  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
};

const fetchWithTimeout = async (url: string): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.CRAWL_TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": env.CRAWL_USER_AGENT,
        Accept: "text/html",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
};

const readBodyCapped = async (res: Response): Promise<string> => {
  const reader = res.body?.getReader();

  if (!reader) {
    return res.text();
  }

  const decoder = new TextDecoder();
  let received = 0;
  let out = "";

  for (;;) {
    const { done, value } = await reader.read();

    if (done) break;

    received += value.byteLength;

    if (received > MAX_BODY_BYTES) {
      await reader.cancel();
      break;
    }

    out += decoder.decode(value, { stream: true });
  }

  return out;
};

const fetchHtml = async (link: string): Promise<string> => {
  await throttlePerHost(link);

  let res = await fetchWithTimeout(link);

  if (res.status === 429 || res.status >= 500) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await fetchWithTimeout(link);
  }

  if (!res.ok) {
    throw new Error(`Fetch failed with status ${res.status}`);
  }

  return readBodyCapped(res);
};

export const enrichJob = async (
  link: string,
): Promise<{ status: DetailsStatus; details: JobDetails | null }> => {
  let html: string;

  try {
    html = await fetchHtml(link);
  } catch (err) {
    logger.warn(`Failed to fetch ${link}`, err);
    return { status: "failed", details: null };
  }

  let details: JobDetails | null;

  try {
    details = extractJobDetails(html);
  } catch (err) {
    logger.warn(`Failed to parse JobPosting for ${link}`, err);
    return { status: "failed", details: null };
  }

  if (!details) {
    return { status: "not_found", details: null };
  }

  if (details.description) {
    details.description = sanitizeDescription(details.description);
  }

  if (details.jobBenefits) {
    details.jobBenefits = sanitizePlainText(details.jobBenefits);
  }

  if (details.employmentType) {
    details.employmentType = sanitizePlainText(details.employmentType);
  }

  return { status: "ok", details };
};
