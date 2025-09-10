// app/api/oauth/authorize/route.ts
// Construit l’URL officielle Strava /oauth/authorize et y redirige l’utilisateur.
// Utilise le state transmis par /api/auth/strava pour sécuriser le flow.

import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/strava";
import { genReqId } from "@/lib/utils";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const reqId = genReqId();
  const url = new URL(req.url);
  const state = url.searchParams.get("state");

  if (!state) {
    logger.warn("Authorize called without state", { reqId });
    return NextResponse.json(
      { ok: false, error: "Missing state" },
      { status: 400 }
    );
  }

  const authorizeUrl = buildAuthorizeUrl(state);

  logger.info("Redirecting to Strava authorize", {
    reqId,
    route: "/api/oauth/authorize",
    state,
    redirect_uri: authorizeUrl,
  });

  return NextResponse.redirect(authorizeUrl, { status: 302 });
}
