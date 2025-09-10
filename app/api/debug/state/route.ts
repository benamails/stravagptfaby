export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { readOAuthState } from "@/lib/redis";

/**
 * GET /api/debug/state?state=xxx
 * Inspecte une entrée state:xxx dans Redis.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  if (!state) {
    return NextResponse.json({ ok: false, error: "missing_state" }, { status: 400 });
  }
  const rec = await readOAuthState(state);
  return NextResponse.json({ ok: true, state, record: rec });
}
