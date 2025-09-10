export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { genReqId } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { saveOAuthState } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const reqId = genReqId();
  const url = new URL(req.url);

  const tool_redirect_uri = url.searchParams.get("tool_redirect_uri");
  const user_id = url.searchParams.get("user_id"); // ✅ récupère l'id applicatif GPT s'il est fourni

  const state = Math.random().toString(36).substring(2) + Date.now().toString(36);

  const res = await saveOAuthState(state, {
    tool_redirect_uri,
    user_id,                 // ✅ on le stocke dans le state
    createdAt: Date.now(),
  });

  logger.info("[auth/strava] state_save_result", {
    reqId,
    state,
    saved: !!res,
    hasRedirect: !!tool_redirect_uri,
    hasUserId: !!user_id,
  });

  if (!res) {
    return NextResponse.json({ ok: false, error: "Failed to persist OAuth state" }, { status: 500 });
  }

  const redirect = new URL("/api/oauth/authorize", url.origin);
  redirect.searchParams.set("state", state);
  return NextResponse.redirect(redirect.toString(), { status: 302 });
}
