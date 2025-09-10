export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { genReqId } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { saveOAuthState } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const reqId = genReqId();
  const url = new URL(req.url);
  const tool_redirect_uri = url.searchParams.get("tool_redirect_uri");
  const state = Math.random().toString(36).substring(2) + Date.now().toString(36);

  const res = await saveOAuthState(state, { tool_redirect_uri, createdAt: Date.now() });
  if (!res) {
    logger.error("[auth/strava] failed to save state", { reqId, state, hasRedirect: !!tool_redirect_uri });
    return NextResponse.json({ ok: false, error: "Failed to persist OAuth state" }, { status: 500 });
  }

  logger.info("[auth/strava] state saved", { reqId, state, hasRedirect: !!tool_redirect_uri });
  const redirect = new URL("/api/oauth/authorize", url.origin);
  redirect.searchParams.set("state", state);
  return NextResponse.redirect(redirect.toString(), { status: 302 });
}
