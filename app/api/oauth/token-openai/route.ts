export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/strava";
import { mapStravaTokenResponse } from "@/lib/tokens";
import { saveTokens, saveAthleteIndex } from "@/lib/redis";
import { logger } from "@/lib/logger";

/**
 * Reçoit du Builder : { code, redirect_uri, user_id? }
 * Échange le code, sauvegarde les tokens, et SI user_id est fourni, crée le mapping user↔athlete.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, redirect_uri, user_id } = body || {};

    if (!code || !redirect_uri) {
      return NextResponse.json(
        { ok: false, error: "missing_code_or_redirect_uri" },
        { status: 400 }
      );
    }

    const tokenRes = await exchangeCodeForToken(code, redirect_uri);
    const mapped = mapStravaTokenResponse(tokenRes);

    await saveTokens(mapped.athlete_id, mapped);

    if (user_id) {
      await saveAthleteIndex(String(user_id), Number(mapped.athlete_id));
      logger.info("[token-openai] linked user to athlete", {
        user_id,
        athlete_id: mapped.athlete_id,
      });
    } else {
      logger.warn("[token-openai] no user_id provided, not linking", {
        athlete_id: mapped.athlete_id,
      });
    }

    return NextResponse.json({
      ok: true,
      athlete_id: mapped.athlete_id,
      expires_at: mapped.expires_at,
      linked: !!user_id,
    });
  } catch (err: any) {
    logger.error("[token-openai] failed", { err: String(err?.message || err) });
    return NextResponse.json({ ok: false, error: "token_exchange_failed" }, { status: 502 });
  }
}
