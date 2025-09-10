import { NextRequest, NextResponse } from "next/server";

// --- Sélection dynamique du backend de stockage ---
// Upstash Redis (recommandé)
let upstashRedis: any = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const { Redis } = await import("@upstash/redis");
  upstashRedis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

// Vercel KV (alternative)
let vercelKv: any = null;
if (process.env.KV_URL && process.env.KV_REST_API_TOKEN) {
  const kvMod = await import("@vercel/kv");
  vercelKv = kvMod.kv;
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function badRequest(msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status: 400 });
}

// Helpers pour scanner/supprimer selon le backend
async function scanAndDelUpstash(pattern: string) {
  let cursor = 0;
  let totalDeleted = 0;
  do {
    const res = await upstashRedis.scan(cursor, { match: pattern, count: 1000 });
    cursor = Number(res[0]);
    const keys: string[] = res[1] || [];
    if (keys.length) {
      // DEL en batch (Upstash accepte del(...keys))
      const delCount = await upstashRedis.del(...keys);
      totalDeleted += Number(delCount) || 0;
    }
  } while (cursor !== 0);
  return totalDeleted;
}

async function scanAndDelVercelKV(pattern: string) {
  // Vercel KV expose kv.keys(pattern)
  const keys: string[] = await vercelKv.keys(pattern);
  let totalDeleted = 0;
  if (keys.length) {
    // delete en batch
    const pipeline = vercelKv.pipeline();
    keys.forEach((k: string) => pipeline.del(k));
    const res = await pipeline.exec();
    totalDeleted = res.filter((r: any) => r === 1).length;
  }
  return totalDeleted;
}

// Patterns fréquents pour tokens Strava
function buildPatterns(athleteId?: string) {
  // Adapte à tes clés réelles si besoin.
  if (athleteId) {
    return [
      `strava:athlete:${athleteId}:token*`,
      `strava:tokens:${athleteId}*`,
      `strava:${athleteId}:*token*`,
    ];
  }
  return [
    "strava:*token*",
    "strava:*oauth*",
    "strava:tokens:*",
    "strava:athlete:*:token*",
  ];
}

export async function POST(req: NextRequest) {
  // --- Auth simple par bearer ---
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return unauthorized();
  }

  // Query params optionnels
  const { searchParams } = new URL(req.url);
  const athleteId = searchParams.get("athlete_id") || undefined;
  const customPrefix = searchParams.get("prefix") || undefined;

  // Validation légère
  if (!upstashRedis && !vercelKv) {
    return NextResponse.json({
      ok: false,
      error:
        "Aucun backend de stockage détecté. Configure UPSTASH_REDIS_* ou KV_URL/KV_REST_API_TOKEN.",
    }, { status: 500 });
  }

  const patterns = customPrefix ? [customPrefix] : buildPatterns(athleteId);
  const deletions: Array<{ pattern: string; deleted: number }> = [];

  for (const p of patterns) {
    let deleted = 0;
    if (upstashRedis) {
      deleted = await scanAndDelUpstash(p);
    } else if (vercelKv) {
      deleted = await scanAndDelVercelKV(p);
    }
    deletions.push({ pattern: p, deleted });
  }

  // Optionnel : purge d’éventuels tokens en variables d’env (non supprimables au run-time)
  const envHints: string[] = [];
  ["STRAVA_ACCESS_TOKEN", "STRAVA_REFRESH_TOKEN"].forEach((name) => {
    if (process.env[name]) envHints.push(name);
  });

  return NextResponse.json({
    ok: true,
    scope: athleteId ? `athlete:${athleteId}` : "global",
    backend: upstashRedis ? "upstash" : "vercel-kv",
    deletions,
    env_tokens_present: envHints, // À supprimer manuellement côté Vercel si listé ici
  });
}
