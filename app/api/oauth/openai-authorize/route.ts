export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { genReqId } from "@/lib/utils";
import { logger } from "@/lib/logger";

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID!;
const APP_BASE_URL = process.env.APP_BASE_URL || "https://stravagptfaby.vercel.app";
const STRAVA_CALLBACK = `${APP_BASE_URL}/api/oauth/callback`;

export async function GET(req: NextRequest) {
  const reqId = genReqId();
  const url = new URL(req.url);
  const toolRedirectUri = url.searchParams.get("redirect_uri") || "";
  const actionId = url.searchParams.get("action_id") || "";

  const stateObj = {
    tool_redirect_uri: toolRedirectUri,
    action_id: actionId,
    ts: Date.now(),
    nonce: crypto.randomUUID(),
  };
  const state = Buffer.from(JSON.stringify(stateObj)).toString("base64url");

  const authorize = new URL("https://www.strava.com/oauth/authorize");
  authorize.searchParams.set("client_id", STRAVA_CLIENT_ID);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", STRAVA_CALLBACK); // IMPORTANT: fixed backend callback
  authorize.searchParams.set("scope", "read,activity:read_all");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("approval_prompt", "auto");

  logger.info("[openai-authorize] redirecting to Strava", {
    reqId,
    toolRedirectUri_present: !!toolRedirectUri,
    strava_redirect_uri: STRAVA_CALLBACK,
  });

  return NextResponse.redirect(authorize.toString(), { status: 302 });
}
