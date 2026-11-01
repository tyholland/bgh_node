import * as cheerio from "cheerio";
import { JobDetails } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonLdNode = Record<string, any>;

const flattenToNodes = (parsed: unknown): JsonLdNode[] => {
  if (Array.isArray(parsed)) {
    return parsed as JsonLdNode[];
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as JsonLdNode;

    if (Array.isArray(obj["@graph"])) {
      return obj["@graph"] as JsonLdNode[];
    }

    return [obj];
  }

  return [];
};

const isJobPosting = (node: JsonLdNode): boolean => {
  const type = node["@type"];

  if (typeof type === "string") {
    return type === "JobPosting";
  }

  if (Array.isArray(type)) {
    return type.includes("JobPosting");
  }

  return false;
};

// A real JobPosting JSON-LD block is a few KB at most. This isn't about
// trusting the page's declared size — it's a floor under JSON.parse itself:
// V8's OOM abort on a pathological JSON string happens inside the parser,
// as a fatal process-level error that no try/catch here can intercept, so
// the string has to be kept away from JSON.parse before the call, not
// handled after it. Length (not byte size) is enough since the fatal
// allocation V8 hit was for a two-byte string — a size check keyed on byte
// length would still let through a tag with this many UTF-16 code units.
const MAX_JSONLD_CHARS = 256 * 1024;

const extractMetaDescription = ($: cheerio.CheerioAPI): string | undefined => {
  const ogDescription = $('meta[property="og:description"]').attr("content");
  if (ogDescription) {
    return ogDescription;
  }

  return $('meta[name="description"]').attr("content");
};

export const findJobPostingNodes = (html: string): JsonLdNode[] => {
  const $ = cheerio.load(html);
  const nodes: JsonLdNode[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).contents().text();

    if (text.length > MAX_JSONLD_CHARS) {
      return;
    }

    try {
      const parsed = JSON.parse(text);

      nodes.push(...flattenToNodes(parsed));
    } catch {
      // many sites emit malformed JSON-LD blocks; skip them
    }
  });

  if (nodes.length === 0) {
    const description = extractMetaDescription($);

    if (description) {
      nodes.push({ "@type": "JobPosting", description });
    }
  }

  return nodes;
};

const firstOf = <T>(value: T | T[] | undefined): T | undefined =>
  Array.isArray(value) ? value[0] : value;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export const mapJobPosting = (node: JsonLdNode): JobDetails => {
  const details: JobDetails = {};

  const datePosted = asString(node.datePosted);
  if (datePosted) details.datePosted = datePosted;

  const validThrough = asString(node.validThrough);
  if (validThrough) details.validThrough = validThrough;

  const jobBenefits = asString(node.jobBenefits);
  if (jobBenefits) details.jobBenefits = jobBenefits;

  const description = asString(node.description);
  if (description) details.description = description;

  if (node.employmentType) {
    details.employmentType = Array.isArray(node.employmentType)
      ? node.employmentType.join(", ")
      : String(node.employmentType);
  }

  const isRemote =
    node.jobLocationType === "TELECOMMUTE" ||
    !!node.applicantLocationRequirements;

  const location = firstOf(node.jobLocation);
  const address = firstOf(location?.address);
  const addressLocality = asString(address?.addressLocality);

  if (isRemote || addressLocality) {
    details.jobLocation = {
      address: {
        addressLocality: isRemote ? "Remote" : (addressLocality as string),
      },
    };
  }

  return details;
};

export const extractJobDetails = (html: string): JobDetails | null => {
  const nodes = findJobPostingNodes(html);
  const jobPosting = nodes.find(isJobPosting);

  if (!jobPosting) {
    return null;
  }

  return mapJobPosting(jobPosting);
};
