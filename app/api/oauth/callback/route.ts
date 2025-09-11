export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { genReqId, renderFallbackHtml } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { readOAuthState, deleteOAuthState, saveTokens, saveAthleteIndex } from "@/lib/redis"; // ✅ add saveAthleteIndex
import { exchangeCodeForToken } from "@/lib/strava";
import { mapStravaTokenResponse } from "@/lib/tokens";

const APP_BASE_URL = process.env.APP_BASE_URL || "https://stravagptfaby.vercel.app";
const STRAVA_CALLBACK = `${APP_BASE_URL}/api/oauth/callback`;

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const reqId = genReqId();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");

  logger.info("[callback] hit", {
    reqId,
    state_present: !!state,
    hasCode: !!code,
    callback_expected: STRAVA_CALLBACK,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
  });

  if (errParam) {
    return NextResponse.json({ ok: false, error: errParam }, { status: 400 });
  }
  if (!code || !state) {
    return NextResponse.json({ ok: false, error: "missing_code_or_state" }, { status: 400 });
  }

  const stateRecord = await readOAuthState(state);
  if (!stateRecord) {
    logger.warn("[callback] invalid_state", { reqId, state });
    return NextResponse.json({ ok: false, error: "invalid_state" }, { status: 400 });
  }

  // On peut consommer l'état maintenant
  await deleteOAuthState(state);

  try {
    // ⚠️ exchangeCodeForToken doit poster avec redirect_uri = STRAVA_CALLBACK côté lib/strava
    const tokenRes = await exchangeCodeForToken(code);
    const mapped = mapStravaTokenResponse(tokenRes);

    await saveTokens(mapped.athlete_id, mapped);

    // ✅ si un user_id était présent dans le state, on crée le lien user_id → athleteId
    if (stateRecord.user_id) {
      await saveAthleteIndex(stateRecord.user_id, mapped.athlete_id);
      logger.info("[callback] athlete index saved", {
        reqId,
        user_id: stateRecord.user_id,
        athlete_id: mapped.athlete_id,
      });
    }

    logger.info("[callback] tokens saved", {
      reqId,
      athlete_id: mapped.athlete_id,
      expires_at: mapped.expires_at,
      t: `${Date.now() - t0}ms`,
    });

    const toolRedirect = stateRecord.tool_redirect_uri;
    const actionId = stateRecord.action_id || stateRecord.openai_action_id;
    if (toolRedirect) {
      try {
        const back = new URL(toolRedirect);
        if (actionId) back.searchParams.set("action_id", String(actionId));
        back.searchParams.set("ok", "1");
        logger.info("[callback] redirecting back to tool", { reqId, to: back.toString() });
        return NextResponse.redirect(back.toString(), { status: 302 });
      } catch {
        logger.warn("[callback] bad tool_redirect_uri", { reqId, toolRedirect });
        return renderFallbackHtml("Finalisation… Retour automatique indisponible.");
      }
    }

    // Pas de tool_redirect_uri → on sert la page fallback (comportement attendu)
    return renderFallbackHtml("Finalisation… Retour automatique indisponible.");
  } catch (err: any) {
    // Normalise erreurs Strava
    const name = err?.name || err?.constructor?.name;
    if (name === "StravaHttpError") {
      logger.error("[callback] provider_400", {
        reqId,
        where: err.where,
        status: err.status,
        body: err.body,
      });
      return NextResponse.json(
        { ok: false, error: "provider_400", provider: { where: err.where, status: err.status, body: err.body } },
        { status: 502 }
      );
    }
    logger.error("[callback] token_exchange_failed", { reqId, err: String(err) });
    return NextResponse.json({ ok: false, error: "token_exchange_failed" }, { status: 502 });
  }
}
