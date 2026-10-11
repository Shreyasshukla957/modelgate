import "dotenv/config";
import { z } from "zod";

const optionalString = z.string().optional().transform((value) => value?.trim() || undefined);

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1),
  ADMIN_API_KEY: z.string().min(16),
  GATEWAY_KEY_PEPPER: z.string().min(16),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_BASE_URL: z.string().url().default("https://generativelanguage.googleapis.com/v1beta/openai"),
  PRIMARY_MODEL: z.string().min(1).default("gemini-3.8-flash"),
  FALLBACK_MODEL: optionalString,
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  REDIS_URL: optionalString.pipe(z.string().url().optional()),
  REDIS_HOST: optionalString,
  REDIS_PORT: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().positive().max(65_535).optional()
  ),
  REDIS_PASSWORD: optionalString,
  RATE_LIMIT_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(10),
  PRIMARY_INPUT_COST_PER_1M_USD: z.coerce.number().nonnegative().default(0.75),
  PRIMARY_OUTPUT_COST_PER_1M_USD: z.coerce.number().nonnegative().default(3.75),
  FALLBACK_INPUT_COST_PER_1M_USD: z.preprocess(value => value === "" ? undefined : value, z.coerce.number().nonnegative().optional()),
  FALLBACK_OUTPUT_COST_PER_1M_USD: z.preprocess(value => value === "" ? undefined : value, z.coerce.number().nonnegative().optional())
}).superRefine((values, context) => {
  if (values.FALLBACK_MODEL && (values.FALLBACK_INPUT_COST_PER_1M_USD === undefined || values.FALLBACK_OUTPUT_COST_PER_1M_USD === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Set both fallback prices explicitly when configuring a fallback model." });
  }
  const hostConfigValues = [values.REDIS_HOST, values.REDIS_PORT, values.REDIS_PASSWORD];
  const hasAnyHostConfig = hostConfigValues.some(Boolean);
  const hasCompleteHostConfig = hostConfigValues.every(Boolean);

  if (values.REDIS_URL && hasAnyHostConfig) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Use either REDIS_URL or REDIS_HOST/REDIS_PORT/REDIS_PASSWORD." });
  }

  if (hasAnyHostConfig && !hasCompleteHostConfig) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "REDIS_HOST, REDIS_PORT, and REDIS_PASSWORD must be set together." });
  }
});

export const env = envSchema.parse(process.env);
