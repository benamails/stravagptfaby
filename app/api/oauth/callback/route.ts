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

  if (errParam) {
    logger.warn("[callback] OAuth error from Strava", { reqId, error: errParam, route: "/api/oauth/callback" });
    return NextResponse.json({ ok: false, error: errParam }, { status: 400 });
  }
  if (!code || !state) {
    logger.warn("[callback] Missing code or state", { reqId, hasCode: !!code, hasState: !!state });
    return NextResponse.json({ ok: false, error: "Missing code or state" }, { status: 400 });
  }

  const stateRecord = await readOAuthState(state);
  if (!stateRecord) {
    logger.warn("[callback] Unknown or expired state", { reqId, state, hint: "Use /api/auth/strava to persist state." });
    return NextResponse.json({ ok: false, error: "Invalid state" }, { status: 400 });
  }

  // Option: consommer l'état tout de suite pour éviter double-usage
  await deleteOAuthState(state);

  try {
    logger.info("[callback] Exchanging code for tokens", { reqId, hasState: true });
    const tokenRes = await exchangeCodeForToken(code);
    const mapped = mapStravaTokenResponse(tokenRes);
    await saveTokens(mapped.athlete_id, mapped);

    logger.info("[callback] Tokens saved", { reqId, athleteId: mapped.athlete_id, expires_at: mapped.expires_at, t: `${Date.now() - t0}ms` });

    const toolRedirect = stateRecord.tool_redirect_uri;
    if (toolRedirect) {
      try {
        const safe = new URL(toolRedirect);
        logger.info("[callback] Redirecting to tool_redirect_uri", { reqId, href: safe.href });
        return NextResponse.redirect(safe.href, { status: 302 });
      } catch {
        logger.warn("[callback] Invalid tool_redirect_uri in state, serving fallback HTML", { reqId, tool_redirect_uri: toolRedirect });
        return renderFallbackHtml("Finalisation… Retour automatique indisponible.");
      }
    }

    logger.warn("[callback] No tool_redirect_uri in state, serving fallback HTML", { reqId });
    return renderFallbackHtml("Finalisation… Retour automatique indisponible.");
  } catch (err: any) {
    logger.error("[callback] Token exchange failed", { reqId, err: String(err?.message || err), t: `${Date.now() - t0}ms` });
    return NextResponse.json({ ok: false, error: "token_exchange_failed" }, { status: 502 });
  }
}
