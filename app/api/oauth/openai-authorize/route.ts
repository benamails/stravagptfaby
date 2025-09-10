export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { saveOAuthState } from "@/lib/redis";
import { getEnv } from "@/config/env";

const STRAVA_OAUTH_BASE = "https://www.strava.com/oauth";

/**
 * Proxy d'autorisation pour satisfaire le Builder:
 * - Reçoit du Builder: redirect_uri (callback ChatGPT) + (optionnel) state + (optionnel) user_id
 * - IMPORTANT: si 'state' est présent, on le RÉUTILISE tel quel (ChatGPT pourra le vérifier)
 * - Redirige vers Strava /oauth/authorize avec ce même state + redirect_uri = ChatGPT
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const openai_redirect = url.searchParams.get("redirect_uri"); // obligatoire (callback ChatGPT)
  const user_id = url.searchParams.get("user_id") || null;      // optionnel en Option B
  const incomingState = url.searchParams.get("state");          // ChatGPT fournit souvent ce param
  const scope = url.searchParams.get("scope") || getEnv().STRAVA_SCOPE;

  if (!openai_redirect) {
    return NextResponse.json({ ok: false, error: "missing_redirect_uri" }, { status: 400 });
  }

  // ⚠️ Crée un state uniquement si ChatGPT n'en a pas fourni (fallback)
  const state = incomingState || (Math.random().toString(36).slice(2) + Date.now().toString(36));

  // Enregistrer des métadonnées utiles (facultatif)
  await saveOAuthState(state, {
    user_id,
    tool_redirect_uri: openai_redirect,
    createdAt: Date.now(),
  });

  const params = new URLSearchParams({
    client_id: getEnv().STRAVA_CLIENT_ID,
    response_type: "code",
    redirect_uri: openai_redirect, // ChatGPT callback
    approval_prompt: "auto",
    scope,
    state, // ← on forward le state (celui du Builder si fourni)
  });

  const authorizeUrl = `${STRAVA_OAUTH_BASE}/authorize?${params.toString()}`;
  logger.info("[openai-authorize] redirect", {
    hasUserId: !!user_id,
    hasIncomingState: !!incomingState,
    openai_redirect,
    state,
    authorizeUrl,
  });

  return NextResponse.redirect(authorizeUrl, { status: 302 });
}
