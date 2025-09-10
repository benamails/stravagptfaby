import { logger } from "@/lib/logger";
import { readTokens, saveTokens, deleteTokens, TokenRecord } from "@/lib/redis";
import { refreshAccessToken, StravaTokenResponse } from "@/lib/strava";

const REFRESH_SAFETY_WINDOW_SEC = 90;

function mask(v: string, visible = 4): string { if (!v) return v; const len = v.length; return len <= visible ? "*".repeat(len) : v.slice(0, visible) + "*".repeat(len - visible); }
function redactTokens(t?: Partial<TokenRecord> | null) {
  if (!t) return t; const out: any = { ...t };
  if (out.access_token) out.access_token = mask(out.access_token);
  if (out.refresh_token) out.refresh_token = mask(out.refresh_token);
  return out;
}

export async function getValidAccessToken(athleteId: number): Promise<string> {
  const tokens = await readTokens(athleteId);
  if (!tokens) throw new Error(`No tokens found for athlete ${athleteId}`);
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresSoon = (tokens.expires_at - nowSec) <= REFRESH_SAFETY_WINDOW_SEC;
  if (!expiresSoon) return tokens.access_token;
  const refreshed = await tryRefresh(athleteId, tokens); return refreshed.access_token;
}

export async function forceRefreshAccessToken(athleteId: number): Promise<string> {
  const tokens = await readTokens(athleteId);
  if (!tokens) throw new Error(`No tokens to refresh for athlete ${athleteId}`);
  const refreshed = await tryRefresh(athleteId, tokens, true); return refreshed.access_token;
}

export async function revokeTokens(athleteId: number) { await deleteTokens(athleteId); }

export function mapStravaTokenResponse(r: StravaTokenResponse): TokenRecord {
  return { athlete_id: r.athlete?.id, access_token: r.access_token, refresh_token: r.refresh_token, expires_at: r.expires_at, scope: r.scope, updatedAt: Date.now() };
}

async function tryRefresh(athleteId: number, current: TokenRecord, force = false): Promise<TokenRecord> {
  try {
    logger.info("[tokens] refreshing access token", { athleteId, force, currentMeta: { expires_at: current.expires_at, updatedAt: current.updatedAt } });
    const next = await refreshAccessToken(current.refresh_token);
    const mapped = mapStravaTokenResponse(next);
    await saveTokens(athleteId, mapped);
    logger.info("[tokens] token refreshed", { athleteId, after: { expires_at: mapped.expires_at, updatedAt: mapped.updatedAt } });
    return mapped;
  } catch (err: any) {
    logger.error("[tokens] refresh failed", { athleteId, err: String(err?.message || err), current: redactTokens(current) });
    throw err;
  }
}
