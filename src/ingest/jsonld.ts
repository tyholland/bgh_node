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

export const findJobPostingNodes = (html: string): JsonLdNode[] => {
  const $ = cheerio.load(html);
  const nodes: JsonLdNode[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).contents().text();

    try {
      const parsed = JSON.parse(text);

      nodes.push(...flattenToNodes(parsed));
    } catch {
      // many sites emit malformed JSON-LD blocks; skip them
    }
  });

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
