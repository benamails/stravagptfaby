export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { readAthleteIndex, saveAthleteIndex } from "@/lib/redis";

/**
 * GET  /api/debug/athlete-index?user_id=abc           → lit le mapping
 * POST /api/debug/athlete-index?user_id=abc&athlete_id=123 → crée/écrase le mapping
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ ok: false, error: "missing_user_id" }, { status: 400 });

  const athleteId = await readAthleteIndex(userId);
  return NextResponse.json({ ok: true, user_id: userId, athlete_id: athleteId });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");
  const athleteId = url.searchParams.get("athlete_id");
  if (!userId || !athleteId) {
    return NextResponse.json({ ok: false, error: "missing_user_id_or_athlete_id" }, { status: 400 });
  }
  await saveAthleteIndex(userId, Number(athleteId));
  return NextResponse.json({ ok: true, user_id: userId, athlete_id: Number(athleteId) });
}
