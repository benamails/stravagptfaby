// app/api/oauth/token/route.ts
// Point interne : proxy sécurisé vers Strava /oauth/token
// Gère 2 cas : authorization_code (rare, via callback) et refresh_token (courant).
// Permet d’avoir un endpoint unifié pour debug si nécessaire.

import { NextRequest, NextResponse } from "next/server";
import { genReqId } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { exchangeCodeForToken, refreshAccessToken } from "@/lib/strava";
import { mapStravaTokenResponse } from "@/lib/tokens";
import { saveTokens } from "@/lib/redis";

export async function POST(req: NextRequest) {
  const reqId = genReqId();
  const t0 = Date.now();

  try {
    const body = await req.json();
    const { code, refresh_token, athlete_id } = body;

    if (!code && !refresh_token) {
      return NextResponse.json(
        { ok: false, error: "Missing code or refresh_token" },
        { status: 400 }
      );
    }

    let mapped;

    if (code) {
      logger.info("[/oauth/token] exchanging code", { reqId });
      const tokenRes = await exchangeCodeForToken(code);
      mapped = mapStravaTokenResponse(tokenRes);
    } else {
      logger.info("[/oauth/token] refreshing token", { reqId, athlete_id });
      const tokenRes = await refreshAccessToken(refresh_token);
      mapped = mapStravaTokenResponse(tokenRes);
    }

    if (athlete_id) {
      await saveTokens(athlete_id, mapped);
    }

    logger.info("[/oauth/token] success", {
      reqId,
      athlete_id: mapped.athlete_id,
      expires_at: mapped.expires_at,
      t: `${Date.now() - t0}ms`,
    });

    return NextResponse.json({ ok: true, tokens: mapped });
  } catch (err: any) {
    logger.error("[/oauth/token] failed", { reqId, err: String(err?.message || err) });
    return NextResponse.json({ ok: false, error: "Token exchange/refresh failed" }, { status: 500 });
  }
}