// lib/strava.ts
// Wrappers HTTP pour l’API Strava : authorize URL, échange de code, refresh token, activités, athlète.
// → Exporte : buildAuthorizeUrl, exchangeCodeForToken, refreshAccessToken,
//             fetchActivities, fetchActivity, fetchAthlete, StravaHttpError

import { getEnv, getRedirectUri } from "@/config/env";
import { logger } from "@/lib/logger";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";
const STRAVA_OAUTH_BASE = "https://www.strava.com/oauth";

/** Erreur riche pour propager status + body (debug provider) */
export class StravaHttpError extends Error {
  status: number;
  body: string;
  where: string;
  constructor(where: string, status: number, body: string) {
    super(`${where}_${status}`);
    this.name = "StravaHttpError";
    this.status = status;
    this.body = body;
    this.where = where;
  }
}

export interface StravaTokenResponse {
  token_type: "Bearer";
  access_token: string;
  expires_at: number; // epoch seconds
  expires_in: number; // seconds
  refresh_token: string;
  athlete: {
    id: number;
    username?: string;
    firstname?: string;
    lastname?: string;
    [key: string]: any;
  };
  scope?: string;
}

/** Construit l’URL officielle /oauth/authorize (inclut redirect_uri, scope, state) */
export function buildAuthorizeUrl(state: string): string {
  const { STRAVA_CLIENT_ID, STRAVA_SCOPE } = getEnv();
  const redirectUri = getRedirectUri();

  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    approval_prompt: "auto",
    scope: STRAVA_SCOPE,
    state,
  });

  return `${STRAVA_OAUTH_BASE}/authorize?${params.toString()}`;
}

/** Échange le code contre des tokens (force redirect_uri pour éviter invalid_grant) */
export async function exchangeCodeForToken(code: string): Promise<StravaTokenResponse> {
  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } = getEnv();
  const redirectUri = getRedirectUri();

  const res = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error("Strava token exchange failed", { status: res.status, body: text });
    throw new StravaHttpError("token_exchange", res.status, text);
  }

  return (await res.json()) as StravaTokenResponse;
}

/** Rafraîchit un access_token */
export async function refreshAccessToken(refreshToken: string): Promise<StravaTokenResponse> {
  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } = getEnv();

  const res = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error("Strava token refresh failed", { status: res.status, body: text });
    throw new StravaHttpError("token_refresh", res.status, text);
  }

  return (await res.json()) as StravaTokenResponse;
}

/** Liste des activités de l’athlète */
export async function fetchActivities(accessToken: string, after?: number) {
  const url = new URL(`${STRAVA_API_BASE}/athlete/activities`);
  url.searchParams.set("per_page", "50");
  if (after) url.searchParams.set("after", String(after));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error("Strava activities fetch failed", { status: res.status, body: text });
    throw new StravaHttpError("activities", res.status, text);
  }

  return res.json();
}

/** Détail d’une activité */
export async function fetchActivity(accessToken: string, id: string) {
  const res = await fetch(`${STRAVA_API_BASE}/activities/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error("Strava activity fetch failed", { status: res.status, body: text });
    throw new StravaHttpError("activity", res.status, text);
  }

  return res.json();
}

/** Profil athlète */
export async function fetchAthlete(accessToken: string) {
  const res = await fetch(`${STRAVA_API_BASE}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error("Strava athlete fetch failed", { status: res.status, body: text });
    throw new StravaHttpError("athlete", res.status, text);
  }

  return res.json();
}
