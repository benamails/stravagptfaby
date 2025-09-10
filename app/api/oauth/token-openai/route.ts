export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/strava";
import { mapStravaTokenResponse } from "@/lib/tokens";
import { saveTokens, readOAuthState, saveAthleteIndex } from "@/lib/redis";
import { logger } from "@/lib/logger";

/**
 * Reçoit du Builder : code + redirect_uri (ChatGPT)
 * Échange contre des tokens Strava, sauvegarde, renvoie athlete_id.
 */
export async function POST(req: NextRequest) {
  try {
    const { code, redirect_uri } = await req.json();

    if (!code || !redirect_uri) {
      return NextResponse.json({ ok: false, error: "missing_code_or_redirect_uri" }, { status: 400 });
    }

    // Échange
    const tokenRes = await exchangeCodeForToken(code, redirect_uri);
    const mapped = mapStravaTokenResponse(tokenRes);

    // Essaie de retrouver le user_id via le state préalablement stocké
    // (OpenAI ne transmet pas `state` au /token ; on peut le récupérer côté Builder en second appel si besoin)
    // Ici, on ne l’a pas -> on sauvegarde seulement tokens, et on renverra athlete_id
    await saveTokens(mapped.athlete_id, mapped);

    logger.info("[token-openai] saved tokens", { athlete_id: mapped.athlete_id });

    return NextResponse.json({
      ok: true,
      athlete_id: mapped.athlete_id,
      expires_at: mapped.expires_at
    });
  } catch (err: any) {
    logger.error("[token-openai] failed", { err: String(err?.message || err) });
    return NextResponse.json({ ok: false, error: "token_exchange_failed" }, { status: 502 });
  }
}
