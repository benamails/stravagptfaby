export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

/**
 * Écrit puis lit une clé volatile pour vérifier la connectivité Redis (Upstash).
 * Réponse attendue: { ok:true, set:"OK", get:"pong" }
 */
export async function GET() {
  try {
    const r = Redis.fromEnv();
    const key = `ping:${Date.now()}`;
    const setRes = await r.set(key, "pong", { ex: 10 });
    const getRes = await r.get<string>(key);
    return NextResponse.json({ ok: true, set: setRes, get: getRes });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
