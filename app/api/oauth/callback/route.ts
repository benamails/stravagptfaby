export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { genReqId, renderFallbackHtml } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { readOAuthState, deleteOAuthState, saveTokens } from "@/lib/redis";
import { exchangeCodeForToken } from "@/lib/strava";
import { mapStravaTokenResponse } from "@/lib/tokens";

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const reqId = genReqId();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");

  logger.info("[callback] hit", { reqId, qs: Object.fromEntries(url.searchParams) });

  if (errParam) {
    logger.warn("[callback] OAuth provider error", { reqId, error: errParam });
    return NextResponse.json({ ok: false, error: errParam }, { status: 400 });
  }
  if (!code || !state) {
    logger.warn("[callback] missing code/state", { reqId, hasCode: !!code, hasState: !!state });
    return NextResponse.json({ ok: false, error: "missing_code_or_state" }, { status: 400 });
  }

  const stateRecord = await readOAuthState(state);
  if (!stateRecord) {
    logger.warn("[callback] invalid or expired state", { reqId, state });
    return NextResponse.json({ ok: false, error: "invalid_state" }, { status: 400 });
  }

  // Consommer l’état tout de suite pour éviter double-usage
  await deleteOAuthState(state);

  try {
    logger.info("[callback] exchanging code→token", { reqId });
    const tokenRes = await exchangeCodeForToken(code); // log détaillé côté lib en cas d'échec
    const mapped = mapStravaTokenResponse(tokenRes);
    await saveTokens(mapped.athlete_id, mapped);

    logger.info("[callback] tokens saved", {
      reqId,
      athleteId: mapped.athlete_id,
      expires_at: mapped.expires_at,
      t: `${Date.now() - t0}ms`,
    });

    const toolRedirect = stateRecord.tool_redirect_uri;
    if (toolRedirect) {
      try {
        const safe = new URL(toolRedirect);
        logger.info("[callback] redirecting back to tool", { reqId, href: safe.href });
        return NextResponse.redirect(safe.href, { status: 302 });
      } catch {
        logger.warn("[callback] invalid tool_redirect_uri, serving fallback", { reqId, tool_redirect_uri: toolRedirect });
        return renderFallbackHtml("Finalisation… Retour automatique indisponible.");
      }
    }

    logger.warn("[callback] no tool_redirect_uri in state, serving fallback", { reqId });
    return renderFallbackHtml("Finalisation… Retour automatique indisponible.");
  } catch (err: any) {
    // exchangeCodeForToken logge déjà le body d’erreur Strava
    logger.error("[callback] token exchange failed", {
      reqId,
      err: String(err?.message || err),
      t: `${Date.now() - t0}ms`,
    });
    // 502 = erreur côté provider OAuth
    return NextResponse.json({ ok: false, error: "token_exchange_failed" }, { status: 502 });
  }
}
