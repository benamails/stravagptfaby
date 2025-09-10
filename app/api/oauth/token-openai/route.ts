export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, StravaHttpError } from "@/lib/strava";
import { mapStravaTokenResponse } from "@/lib/tokens";
import { saveTokens, saveAthleteIndex } from "@/lib/redis";
import { logger } from "@/lib/logger";

/**
 * Accepts BOTH JSON and x-www-form-urlencoded bodies from the Builder:
 * - expects: code, redirect_uri (ChatGPT callback), optional user_id
 * - exchanges code with Strava using the SAME redirect_uri
 * - saves tokens, and if user_id provided, links user_id ↔ athlete_id
 * - returns provider error body when available (temporary for debug)
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
      // Try both ways anyway (some proxies strip content-type)
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
          hint: "Token URL must receive 'code' and the SAME 'redirect_uri' that was used at /authorize (ChatGPT callback).",
        },
        { status: 400 }
      );
    }

    // Exchange with Strava using the EXACT same redirect_uri ChatGPT sent back
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
      logger.warn("[token-openai] no user_id provided; tokens saved without linking", {
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
    if (err instanceof StravaHttpError) {
      // TEMP: bubble up provider error to see exact reason of failure
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
