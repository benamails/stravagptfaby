// lib/redis.ts
// Client Redis (Upstash) + helpers typés pour stocker états OAuth et tokens Strava.
// ✅ Tolère les retours Upstash en string OU déjà-parsé (objet).
//    → getStr() renvoie "any", et getJSON() détecte string vs objet.

import { Redis } from "@upstash/redis";
import { getDefaultTtlSeconds } from "@/config/env";

let _redis: Redis | null = null;
export function redis(): Redis {
  if (_redis) return _redis;
  _redis = Redis.fromEnv();
  return _redis!;
}

export const k = {
  oauthState: (state: string) => `state:${state}`,
  tokensByAthlete: (athleteId: number | string) => `tokens:${athleteId}`,
  athleteIndexByUser: (userId: string) => `athleteIndex:${userId}`,
};

export interface OAuthStateRecord {
  tool_redirect_uri?: string | null;
  createdAt: number; // epoch ms
}

export interface TokenRecord {
  athlete_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds
  scope?: string;
  updatedAt?: number; // epoch ms
}

// --------- Bas niveau (string/any) ---------

export async function setStr(
  key: string,
  value: string,
  ttlSeconds: number = getDefaultTtlSeconds()
): Promise<string | null> {
  try {
    if (ttlSeconds > 0) {
      return await redis().set(key, value, { ex: ttlSeconds });
    }
    return await redis().set(key, value);
  } catch (err) {
    console.error("[redis.setStr] error", { key, err });
    return null;
  }
}

/**
 * Upstash peut renvoyer soit une string, soit un objet déjà parsé (selon SDK/usage).
 * On type en "any" pour laisser la couche supérieure décider.
 */
export async function getStr(key: string): Promise<any | null> {
  try {
    return await redis().get(key);
  } catch (err) {
    console.error("[redis.getStr] error", { key, err });
    return null;
  }
}

export async function delKey(key: string): Promise<number> {
  try {
    return await redis().del(key);
  } catch (err) {
    console.error("[redis.delKey] error", { key, err });
    return 0;
  }
}

// --------- JSON helpers ---------

export async function setJSON<T>(
  key: string,
  value: T,
  ttlSeconds: number = getDefaultTtlSeconds()
): Promise<string | null> {
  try {
    const serialized = JSON.stringify(value);
    return await setStr(key, serialized, ttlSeconds);
  } catch (err) {
    console.error("[redis.setJSON] error", { key, err });
    return null;
  }
}

/**
 * Lit une valeur JSON en tolérant string (à parser) ou objet déjà parsé.
 */
export async function getJSON<T = unknown>(key: string): Promise<T | null> {
  const val = await getStr(key);
  if (val == null) return null;

  try {
    if (typeof val === "string") {
      return JSON.parse(val) as T;
    }
    // Déjà un objet → renvoi direct
    return val as T;
  } catch (err) {
    console.error("[redis.getJSON] parse error", { key, val, err });
    return null;
  }
}

// --------- Helpers métiers ---------

export async function saveOAuthState(
  state: string,
  record: OAuthStateRecord,
  ttlSeconds?: number
) {
  return setJSON<OAuthStateRecord>(k.oauthState(state), record, ttlSeconds);
}

export async function readOAuthState(state: string) {
  return getJSON<OAuthStateRecord>(k.oauthState(state));
}

export async function deleteOAuthState(state: string) {
  return delKey(k.oauthState(state));
}

export async function saveTokens(
  athleteId: number,
  tokens: TokenRecord,
  ttlSeconds?: number
) {
  const payload: TokenRecord = { ...tokens, updatedAt: Date.now() };
  return setJSON<TokenRecord>(k.tokensByAthlete(athleteId), payload, ttlSeconds);
}

export async function readTokens(athleteId: number) {
  return getJSON<TokenRecord>(k.tokensByAthlete(athleteId));
}

export async function deleteTokens(athleteId: number) {
  return delKey(k.tokensByAthlete(athleteId));
}

export async function saveAthleteIndex(userId: string, athleteId: number) {
  return setStr(k.athleteIndexByUser(userId), String(athleteId));
}

export async function readAthleteIndex(userId: string) {
  const v: any = await getStr(k.athleteIndexByUser(userId));
  return v ? Number(v) : null;
}

export async function deleteAthleteIndex(userId: string) {
  return delKey(k.athleteIndexByUser(userId));
}
