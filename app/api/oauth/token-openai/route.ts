export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, StravaHttpError } from "@/lib/strava";
import { mapStravaTokenResponse } from "@/lib/tokens";
import { saveTokens, saveAthleteIndex } from "@/lib/redis";
import { logger } from "@/lib/logger";

/**
 * Accepte JSON ou x-www-form-urlencoded.
 * Attend: code, redirect_uri (callback ChatGPT), user_id (optionnel).
 * Echange le code chez Strava, stocke les vrais tokens côté serveur,
 * et retourne un "access_token" OAUTH FACTICE pour satisfaire le Builder (sans exposer les secrets Strava).
 */
export async function POST(req: NextRequest) {
  try {
    const ctype = req.headers.get("content-type") || "";
    let code: string | undefined;
    let redirect_uri: string | undefined;
    let user_id: string | undefined;

    if (ctype.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      code = body?.code;
      redirect_uri = body?.redirect_uri;
      user_id = body?.user_id ? String(body.user_id) : undefined;
    } else if (ctype.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      code = form.get("code")?.toString();
      redirect_uri = form.get("redirect_uri")?.toString();
      user_id = form.get("user_id")?.toString();
    } else {
      // Try both
      try {
        const body = await req.json();
        code = body?.code;
        redirect_uri = body?.redirect_uri;
        user_id = body?.user_id ? String(body.user_id) : undefined;
      } catch {
        const form = await req.formData().catch(() => null);
        if (form) {
          code = form.get("code")?.toString();
          redirect_uri = form.get("redirect_uri")?.toString();
          user_id = form.get("user_id")?.toString();
        }
      }
    }

    logger.info("[token-openai] received", {
      ctype,
      hasCode: !!code,
      hasRedirectUri: !!redirect_uri,
      hasUserId: !!user_id,
    });

    if (!code || !redirect_uri) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_code_or_redirect_uri",
          hint: "Token URL must receive 'code' and the SAME 'redirect_uri' used at /authorize (ChatGPT callback).",
        },
        { status: 400 }
      );
    }

    // Echange chez Strava avec le MEME redirect_uri que ChatGPT a utilisé
    const tokenRes = await exchangeCodeForToken(code, redirect_uri);
    const mapped = mapStravaTokenResponse(tokenRes);

    // Stockage serveur des vrais tokens Strava
    await saveTokens(mapped.athlete_id, mapped);

    // Lien user ↔ athlete si présent (Option B)
    let linked = false;
    if (user_id) {
      await saveAthleteIndex(String(user_id), Number(mapped.athlete_id));
      linked = true;
      logger.info("[token-openai] linked user to athlete", {
        user_id,
        athlete_id: mapped.athlete_id,
      });
    } else {
      logger.warn("[token-openai] no user_id provided; tokens saved without linking", {
        athlete_id: mapped.athlete_id,
      });
    }

    /**
     * IMPORTANT pour le Builder:
     * On retourne un payload OAUTH "standard" pour satisfaire la validation:
     * - access_token: jeton OPAQUE factice (ne révèle pas le token Strava)
     * - token_type: "Bearer"
     * - expires_in: durée nominale (ex. 3600s)
     * - scope: nominal
     * On inclut AUSSI nos champs utiles (ok, athlete_id, expires_at, linked).
     */
    const responseBody = {
      // Champs attendus par OpenAI Actions OAuth
      access_token: `tool-${mapped.athlete_id}-${Math.random().toString(36).slice(2)}`,
      token_type: "Bearer",
      expires_in: 3600,
      scope: "strava-proxy",

      // Nos infos applicatives
      ok: true,
      athlete_id: mapped.athlete_id,
      expires_at: mapped.expires_at,
      linked,
    };

    return new NextResponse(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err: any) {
    if (err instanceof StravaHttpError) {
      logger.error("[token-openai] provider error", {
        where: err.where,
        status: err.status,
        body: err.body,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "provider_error",
          provider: { where: err.where, status: err.status, body: err.body },
        },
        { status: 502 }
      );
    }
    logger.error("[token-openai] failed", { err: String(err?.message || err) });
    return NextResponse.json({ ok: false, error: "token_exchange_failed" }, { status: 502 });
  }
}
