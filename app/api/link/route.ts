export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { saveAthleteIndex } from "@/lib/redis";

export async function POST(req: NextRequest) {
  const { user_id, athlete_id } = await req.json();
  if (!user_id || !athlete_id) {
    return NextResponse.json({ ok: false, error: "missing_user_id_or_athlete_id" }, { status: 400 });
  }
  await saveAthleteIndex(String(user_id), Number(athlete_id));
  return NextResponse.json({ ok: true });
}
