export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/strava";

export async function GET() {
  // on simule un state fixe uniquement pour visualiser l'URL
  const url = buildAuthorizeUrl("__debug_state__");
  return NextResponse.json({ ok: true, authorize_url: url });
}
