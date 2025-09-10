export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getEnv, getRedirectUri } from "@/config/env";

export async function GET() {
  const env = getEnv();
  return NextResponse.json({
    ok: true,
    APP_URL: env.APP_URL,
    STRAVA_REDIRECT_PATH: env.STRAVA_REDIRECT_PATH,
    redirect_uri: getRedirectUri(),
    STRAVA_CLIENT_ID_len: env.STRAVA_CLIENT_ID?.length || 0,
    STRAVA_CLIENT_SECRET_len: env.STRAVA_CLIENT_SECRET?.length || 0
  });
}
