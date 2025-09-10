// config/env.ts
// Centralise et valide les variables d'environnement (côté serveur uniquement).
// Utilise Zod pour un fail-fast clair en build/runtime, sans exposer les secrets côté client.

import { z } from "zod";

const EnvSchema = z.object({
  // ---- App ----
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z
    .string()
    .url()
    .describe("URL publique de l'app (ex: https://stravagptfaby.vercel.app)"),

  // ---- Strava OAuth ----
  STRAVA_CLIENT_ID: z
    .string()
    .min(1)
    .describe("Client ID Strava (public côté OAuth, mais lu côté serveur)"),
  STRAVA_CLIENT_SECRET: z
    .string()
    .min(1)
    .describe("Client Secret Strava (NE JAMAIS exposer côté client)"),
  STRAVA_REDIRECT_PATH: z
    .string()
    .default("/api/oauth/callback")
    .describe("Chemin local du callback OAuth"),
  STRAVA_SCOPE: z
    .string()
    .default("read,activity:read_all")
    .describe("Scopes Strava requis"),

  // ---- Upstash Redis ----
  UPSTASH_REDIS_REST_URL: z
    .string()
    .url()
    .describe("URL REST Upstash Redis"),
  UPSTASH_REDIS_REST_TOKEN: z
    .string()
    .min(1)
    .describe("Token REST Upstash Redis"),
  REDIS_TTL_SECONDS: z
    .string()
    .optional()
    .describe("TTL par défaut en secondes (optionnel, ex: 2592000 pour 30j)"),
});

type Env = z.infer<typeof EnvSchema>;

let _env: Env | null = null;

/**
 * Charge et valide les variables d'env une seule fois.
 * En cas d'erreur, lève une exception explicite (utile sur Vercel).
 */
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
    REDIS_TTL_SECONDS: process.env.REDIS_TTL_SECONDS,
  });

  if (!parsed.success) {
    const formatted = parsed.error.format();
    // On masque explicitement toute valeur potentiellement sensible
    const redacted = JSON.stringify(formatted, null, 2);
    throw new Error(
      `❌ Invalid environment configuration.\n${redacted}\n` +
        `Vérifie .env / Variables de Projet Vercel.`
    );
  }

  _env = parsed.data;
  return _env;
}

export const isProd = () => getEnv().NODE_ENV === "production";

/**
 * Construit l'URL complète de redirection OAuth (APP_URL + STRAVA_REDIRECT_PATH)
 */
export function getRedirectUri(): string {
  const { APP_URL, STRAVA_REDIRECT_PATH } = getEnv();
  // Normalise les slashes
  const base = APP_URL.replace(/\/+$/, "");
  const path = STRAVA_REDIRECT_PATH.startsWith("/")
    ? STRAVA_REDIRECT_PATH
    : `/${STRAVA_REDIRECT_PATH}`;
  return `${base}${path}`;
}

/**
 * TTL par défaut pour les clés Redis (ex: états OAuth, tokens, etc.)
 * Priorité à REDIS_TTL_SECONDS si défini, sinon 30 jours.
 */
export function getDefaultTtlSeconds(): number {
  const { REDIS_TTL_SECONDS } = getEnv();
  if (REDIS_TTL_SECONDS && /^\d+$/.test(REDIS_TTL_SECONDS)) {
    return parseInt(REDIS_TTL_SECONDS, 10);
  }
  // 30 jours par défaut
  return 30 * 24 * 60 * 60;
}
