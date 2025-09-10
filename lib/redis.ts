// lib/redis.ts
// Client Redis (Upstash) + helpers typés pour stocker états OAuth et tokens Strava.
// Utilise Redis REST (serverless friendly) et JSON.stringify/parse pour valeurs complexes.

import { Redis } from "@upstash/redis";
import { getDefaultTtlSeconds } from "@/config/env";

// --------- Singleton client ---------
let _redis: Redis | null = null;

export function redis(): Redis {
  if (_redis) return _redis;
  // Charge automatiquement UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN depuis l'env
  _redis = Redis.fromEnv();
  return _redis!;
}

// --------- Namespaces de clés ---------
// Sépare clairement les espaces pour éviter les collisions et faciliter la purge ciblée.
export const k = {
  oauthState: (state: string) => `state:${state}`,               // stocke tool_redirect_uri, createdAt
  tokensByAthlete: (athleteId: number | string) => `tokens:${athleteId}`, // access/refresh/expiry
  athleteIndexByUser: (userId: string) => `athleteIndex:${userId}`,       // mappe user GPT → athleteId
};

// --------- Types utiles (pour JSON) ---------
export interface OAuthStateRecord {
  tool_redirect_uri?: string | null;
  createdAt: number; // epoch ms
}

export interface TokenRecord {
  athlete_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds (Strava)
  scope?: string;
  updatedAt?: number; // epoch ms
}

// --------- Helpers bas niveau (string) ---------
export async function setStr(
  key: string,
  value: string,
  ttlSeconds: number = getDefaultTtlSeconds()
): Promise<"OK" | null> {
  try {
    if (ttlSeconds > 0) {
      return await redis().set(key, value, { ex: ttlSeconds });
    }
    return await redis().set(key, value);
  } catch (err) {
    // Ne pas throw pour éviter de casser le flow OAuth ; laisse l'appelant décider si nécessaire
    console.error("[redis.setStr] error", { key, err });
    return null;
  }
}

export async function getStr(key: string): Promise<string | null> {
  try {
    return await redis().get<string | null>(key);
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

// --------- Helpers JSON (hauts niveaux) ---------
export async function setJSON<T>(
  key: string,
  value: T,
  ttlSeconds: number = getDefaultTtlSeconds()
): Promise<"OK" | null> {
  try {
    const serialized = JSON.stringify(value);
    return await setStr(key, serialized, ttlSeconds);
  } catch (err) {
    console.error("[redis.setJSON] error", { key, err });
    return null;
  }
}

export async function getJSON<T = unknown>(key: string): Promise<T | null> {
  const str = await getStr(key);
  if (str == null) return null;
  try {
    return JSON.parse(str) as T;
  } catch (err) {
    console.error("[redis.getJSON] parse error", { key, err });
    return null;
  }
}

// --------- Helpers dédiés (états OAuth & tokens) ---------
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
  // Par sécurité, on force updatedAt côté serveur
  const payload: TokenRecord = { ...tokens, updatedAt: Date.now() };
  return setJSON<TokenRecord>(k.tokensByAthlete(athleteId), payload, ttlSeconds);
}

export async function readTokens(athleteId: number) {
  return getJSON<TokenRecord>(k.tokensByAthlete(athleteId));
}

export async function deleteTokens(athleteId: number) {
  return delKey(k.tokensByAthlete(athleteId));
}

// --------- Index user→athlete (facultatif, utile si tu lies un user GPT à un athlete Strava) ---------
export async function saveAthleteIndex(userId: string, athleteId: number) {
  return setStr(k.athleteIndexByUser(userId), String(athleteId));
}

export async function readAthleteIndex(userId: string) {
  const v = await getStr(k.athleteIndexByUser(userId));
  return v ? Number(v) : null;
}

export async function deleteAthleteIndex(userId: string) {
  return delKey(k.athleteIndexByUser(userId));
}
