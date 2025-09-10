export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const athleteId = url.searchParams.get("athlete_id");
  if (!athleteId) {
    return NextResponse.json({ ok: false, error: "missing_athlete_id" }, { status: 400 });
  }
  const tokens = await readTokens(Number(athleteId));
  if (!tokens) {
    return NextResponse.json({ ok: false, tokens: null }, { status: 404 });
  }
  // masquer un peu les secrets
  const masked = {
    ...tokens,
    access_token: tokens.access_token?.slice(0, 6) + "...",
    refresh_token: tokens.refresh_token?.slice(0, 6) + "...",
  };
  return NextResponse.json({ ok: true, tokens: masked });
}
