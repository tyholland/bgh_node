import { z } from "zod";

const boolFromString = z
  .string()
  .optional()
  .transform((v) => v === "true");

const numberFromString = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : fallback));

const envSchema = z.object({
  PORT: z.string().default("8080"),

  DB_HOST: z.string().min(1),
  DB_PORT: z.string().optional(),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB: z.string().min(1),
  DB_SSL: boolFromString,

  CSV_SOURCE_URL: z.string().url(),
  ALLOWED_ORIGINS: z.string().default(""),

  INGEST_TRIGGER_SECRET: z.string().min(1),
  INGEST_CRON: z.string().default("0 3,9,15,21 * * *"),

  FRONTEND_REVALIDATE_URL: z.string().url().optional(),
  REVALIDATE_SECRET: z.string().optional(),

  CLIENT_ID: z.string().optional(),
  CLIENT_SECRET: z.string().optional(),
  REDIRECT_URI: z.string().optional(),
  REFRESH_TOKEN: z.string().optional(),
  SENDER_EMAIL: z.string().optional(),
  CONTACT_RECIPIENTS: z
    .string()
    .default("ty@heiprodigital.com,cpbeganski@gmail.com,ben@greenefamily.us"),
  TURNSTILE_SECRET: z.string().optional(),

  CRAWL_CONCURRENCY: numberFromString(6),
  CRAWL_TIMEOUT_MS: numberFromString(10000),
  CRAWL_USER_AGENT: z
    .string()
    .default(
      "Mozilla/5.0 (compatible; BghScoutBot/1.0; +https://www.bghscout.com)",
    ),
  DETAILS_OK_TTL_HOURS: numberFromString(168),
  DETAILS_RETRY_HOURS: numberFromString(6),
});

export type Env = z.infer<typeof envSchema> & {
  DB_PORT_NUM?: number;
  ALLOWED_ORIGINS_LIST: string[];
  CONTACT_RECIPIENTS_LIST: string[];
};

const parsed = envSchema.parse(process.env);

export const env: Env = {
  ...parsed,
  DB_PORT_NUM: parsed.DB_PORT ? Number(parsed.DB_PORT) : undefined,
  ALLOWED_ORIGINS_LIST: parsed.ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  CONTACT_RECIPIENTS_LIST: parsed.CONTACT_RECIPIENTS.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};
