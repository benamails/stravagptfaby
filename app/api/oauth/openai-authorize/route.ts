export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { saveOAuthState } from "@/lib/redis";
import { getEnv } from "@/config/env";

const STRAVA_OAUTH_BASE = "https://www.strava.com/oauth";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const user_id = url.searchParams.get("user_id");
  const openai_redirect = url.searchParams.get("redirect_uri"); // ← ChatGPT callback MUST be here
  const scope = url.searchParams.get("scope") || getEnv().STRAVA_SCOPE;

  if (!user_id) {
    return NextResponse.json({ ok: false, error: "missing_user_id" }, { status: 400 });
  }
  if (!openai_redirect) {
    return NextResponse.json({ ok: false, error: "missing_redirect_uri" }, { status: 400 });
  }

  // Génère et stocke le state (on gardera user_id pour linker après l’échange)
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await saveOAuthState(state, { user_id, tool_redirect_uri: openai_redirect, createdAt: Date.now() });

  // Construit l’URL Strava avec redirect_uri = ChatGPT callback
  const params = new URLSearchParams({
    client_id: getEnv().STRAVA_CLIENT_ID,
    response_type: "code",
    redirect_uri: openai_redirect, // <-- IMPORTANT
    approval_prompt: "auto",
    scope,
    state,
  });

  const authorizeUrl = `${STRAVA_OAUTH_BASE}/authorize?${params.toString()}`;
  logger.info("[openai-authorize] redirect", { user_id, authorizeUrl, state });

  return NextResponse.redirect(authorizeUrl, { status: 302 });
}
