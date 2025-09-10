export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { saveOAuthState } from "@/lib/redis";
import { getEnv } from "@/config/env";

const STRAVA_OAUTH_BASE = "https://www.strava.com/oauth";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const user_id = url.searchParams.get("user_id");             // ← devient OPTIONNEL
  const openai_redirect = url.searchParams.get("redirect_uri"); // ← OBLIGATOIRE (callback ChatGPT)
  const scope = url.searchParams.get("scope") || getEnv().STRAVA_SCOPE;

  if (!openai_redirect) {
    return NextResponse.json(
      { ok: false, error: "missing_redirect_uri" },
      { status: 400 }
    );
  }

  // Génère et stocke le state (même si user_id est null, on garde la place)
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await saveOAuthState(state, {
    user_id: user_id || null,
    tool_redirect_uri: openai_redirect,
    createdAt: Date.now(),
  });

  const params = new URLSearchParams({
    client_id: getEnv().STRAVA_CLIENT_ID,
    response_type: "code",
    redirect_uri: openai_redirect, // ChatGPT callback
    approval_prompt: "auto",
    scope,
    state,
  });

  const authorizeUrl = `${STRAVA_OAUTH_BASE}/authorize?${params.toString()}`;
  logger.info("[openai-authorize] redirect", {
    hasUserId: !!user_id,
    openai_redirect,
    authorizeUrl,
    state,
  });

  return NextResponse.redirect(authorizeUrl, { status: 302 });
}
