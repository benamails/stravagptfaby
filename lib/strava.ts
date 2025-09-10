import { getEnv, getRedirectUri } from "@/config/env"; // <- déjà présent

export async function exchangeCodeForToken(code: string): Promise<StravaTokenResponse> {
  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } = getEnv();
  const redirectUri = getRedirectUri(); // ✅ récupère le même redirect_uri que celui passé à /authorize

  const res = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri, // ✅ important : doit matcher EXACTEMENT
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error("Strava token exchange failed", { status: res.status, body: text });
    // si tu as déjà la classe StravaHttpError, tu peux throw new StravaHttpError("token_exchange", res.status, text);
    throw new Error(`strava_token_exchange_${res.status}:${text}`);
  }

  return (await res.json()) as StravaTokenResponse;
}
