// app/api/auth/strava/route.ts
// Point d’entrée "Se connecter à Strava" pour GPT.
// Génère un state unique, l’enregistre en Redis avec tool_redirect_uri (si fourni),
// puis redirige vers /api/oauth/authorize.

import { NextRequest, NextResponse } from "next/server";
import { genReqId } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { saveOAuthState } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const reqId = genReqId();
  const url = new URL(req.url);
  const tool_redirect_uri = url.searchParams.get("tool_redirect_uri");

  // Génération d’un state aléatoire
  const state = Math.random().toString(36).substring(2) + Date.now().toString(36);

  // Sauvegarde en Redis
  await saveOAuthState(state, {
    tool_redirect_uri,
    createdAt: Date.now(),
  });

  logger.info("Auth start", {
    reqId,
    route: "/api/auth/strava",
    state,
    hasRedirect: !!tool_redirect_uri,
  });

  // Redirection vers /api/oauth/authorize avec le state
  const redirect = new URL("/api/oauth/authorize", url.origin);
  redirect.searchParams.set("state", state);

  return NextResponse.redirect(redirect.toString(), { status: 302 });
}
