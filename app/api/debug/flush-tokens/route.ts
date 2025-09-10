import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

async function scanAndDel(pattern: string, dryRun: boolean) {
  let cursor = 0;
  let totalDeleted = 0;
  let matchedKeys: string[] = [];
  do {
    const res = await redis.scan(cursor, { match: pattern, count: 1000 });
    cursor = Number(res[0]);
    const keys: string[] = res[1] || [];
    matchedKeys.push(...keys);
    if (!dryRun && keys.length) {
      const delCount = await redis.del(...keys);
      totalDeleted += Number(delCount) || 0;
    }
  } while (cursor !== 0);
  return { totalDeleted, matchedKeys };
}

function buildPatterns(athleteId?: string) {
  if (athleteId) {
    return [
      `strava:athlete:${athleteId}:token*`,
      `strava:tokens:${athleteId}*`,
      `strava:${athleteId}:*token*`,
    ];
  }
  return ["strava:*token*", "strava:*oauth*", "strava:tokens:*", "strava:athlete:*:token*"];
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== process.env.ADMIN_TOKEN) return unauthorized();

  const { searchParams } = new URL(req.url);
  const athleteId = searchParams.get("athlete_id") || undefined;
  const customPrefix = searchParams.get("prefix") || undefined;
  const dryRun = searchParams.get("dry_run") === "1";

  const patterns = customPrefix ? [customPrefix] : buildPatterns(athleteId);
  const results: Array<{ pattern: string; deleted: number; matches: string[] }> = [];

  for (const p of patterns) {
    const { totalDeleted, matchedKeys } = await scanAndDel(p, dryRun);
    results.push({ pattern: p, deleted: dryRun ? 0 : totalDeleted, matches: matchedKeys });
  }

  const envHints: string[] = [];
  ["STRAVA_ACCESS_TOKEN", "STRAVA_REFRESH_TOKEN"].forEach((name) => {
    if (process.env[name]) envHints.push(name);
  });

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    scope: athleteId ? `athlete:${athleteId}` : "global",
    deletions: results,
    env_tokens_present: envHints, // à retirer manuellement des variables d'env si présent
  });
}
