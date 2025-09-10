// lib/strava.ts
// Wrappers HTTP pour l’API Strava : authorize URL, échange de code, refresh token, activités, athlète.
// Utilise fetch natif (Node 18+/Vercel).

import { getEnv, getRedirectUri } from "@/config/env";
import { logger } from "@/lib/logger";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";
const STRAVA_OAUTH_BASE = "https://www.strava.com/oauth";

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

export async function exchangeCodeForToken(code: string): Promise<StravaTokenResponse> {
  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } = getEnv();

  const res = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error("Strava token exchange failed", { status: res.status, text });
    throw new Error(`Strava token exchange failed: ${res.status}`);
  }

  return (await res.json()) as StravaTokenResponse;
}

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
    logger.error("Strava token refresh failed", { status: res.status, text });
    throw new Error(`Strava token refresh failed: ${res.status}`);
  }

  return (await res.json()) as StravaTokenResponse;
}

export async function fetchActivities(accessToken: string, after?: number) {
  const url = new URL(`${STRAVA_API_BASE}/athlete/activities`);
  url.searchParams.set("per_page", "50");
  if (after) url.searchParams.set("after", String(after));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    // Strava supporte GET simple ; pas besoin d'autres headers.
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error("Strava activities fetch failed", { status: res.status, text });
    throw new Error(`Strava activities fetch failed: ${res.status}`);
  }

  return res.json();
}

export async function fetchActivity(accessToken: string, id: string) {
  const res = await fetch(`${STRAVA_API_BASE}/activities/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error("Strava activity fetch failed", { status: res.status, text });
    throw new Error(`Strava activity fetch failed: ${res.status}`);
  }

  return res.json();
}

export async function fetchAthlete(accessToken: string) {
  const res = await fetch(`${STRAVA_API_BASE}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error("Strava athlete fetch failed", { status: res.status, text });
    throw new Error(`Strava athlete fetch failed: ${res.status}`);
  }

  return res.json();
}