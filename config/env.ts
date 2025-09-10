import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(),
  STRAVA_CLIENT_ID: z.string().min(1),
  STRAVA_CLIENT_SECRET: z.string().min(1),
  STRAVA_REDIRECT_PATH: z.string().default("/api/oauth/callback"),
  STRAVA_SCOPE: z.string().default("read,activity:read_all"),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  REDIS_TTL_SECONDS: z.string().optional()
});

type Env = z.infer<typeof EnvSchema>;
let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;
  const parsed = EnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    APP_URL: process.env.APP_URL,
    STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID,
    STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET,
    STRAVA_REDIRECT_PATH: process.env.STRAVA_REDIRECT_PATH,
    STRAVA_SCOPE: process.env.STRAVA_SCOPE,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    REDIS_TTL_SECONDS: process.env.REDIS_TTL_SECONDS
  });
  if (!parsed.success) {
    const redacted = JSON.stringify(parsed.error.format(), null, 2);
    throw new Error(`❌ Invalid environment configuration.\n${redacted}`);
  }
  _env = parsed.data;
  return _env;
}

export const isProd = () => getEnv().NODE_ENV === "production";

export function getRedirectUri(): string {
  const { APP_URL, STRAVA_REDIRECT_PATH } = getEnv();
  const base = APP_URL.replace(/\/+$/, "");
  const path = STRAVA_REDIRECT_PATH.startsWith("/")
    ? STRAVA_REDIRECT_PATH
    : `/${STRAVA_REDIRECT_PATH}`;
  return `${base}${path}`;
}

export function getDefaultTtlSeconds(): number {
  const { REDIS_TTL_SECONDS } = getEnv();
  if (REDIS_TTL_SECONDS && /^\d+$/.test(REDIS_TTL_SECONDS)) {
    return parseInt(REDIS_TTL_SECONDS, 10);
    }
  return 30 * 24 * 60 * 60;
}
