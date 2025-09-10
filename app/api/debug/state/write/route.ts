export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

/**
 * GET /api/debug/state/write?state=test123
 * Écrit state:test123 puis relit la valeur pour valider l'écriture/lecture.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") || Math.random().toString(36).slice(2);
  try {
    const r = Redis.fromEnv();
    const key = `state:${state}`;
    const value = { tool_redirect_uri: null, createdAt: Date.now() };
    const setRes = await r.set(key, JSON.stringify(value), { ex: 600 });
    const getRes = await r.get<string>(key);
    let parsed: any = null;
    try { parsed = getRes ? JSON.parse(getRes) : null; } catch {}
    return NextResponse.json({ ok: true, state, set: setRes, readRaw: getRes, readParsed: parsed });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, state, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
