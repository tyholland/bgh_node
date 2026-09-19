import crypto from "crypto";

export const buildETag = (body: string): string =>
  `"${crypto.createHash("sha1").update(body).digest("hex")}"`;
