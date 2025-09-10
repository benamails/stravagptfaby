// app/api/oauth/callback/route.ts
// Reçoit code + state depuis Strava, vérifie le state, échange les tokens,
// persiste en Redis, puis tente un "retour conversation" via tool_redirect_uri.
// Sert un HTML de fallback si aucun redirect n'est disponible.

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
  const error = url.searchParams.get("error");

  if (error) {
    // Strava peut renvoyer ?error=access_denied
    logger.warn("[callback] OAuth error from Strava", { reqId, error, route: "/api/oauth/callback" });
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }

  if (!code || !state) {
    logger.warn("[callback] Missing code or state", { reqId, hasCode: !!code, hasState: !!state });
    return NextResponse.json({ ok: false, error: "Missing code or state" }, { status: 400 });
  }

  // Récupère l'état OAuth (doit contenir tool_redirect_uri si fourni)
  const stateRecord = await readOAuthState(state);
  if (!stateRecord) {
    logger.warn("[callback] Unknown or expired state", { reqId, state });
    return NextResponse.json({ ok: false, error: "Invalid state" }, { status: 400 });
  }

  // Échange du code contre des tokens
  try {
    logger.info("[callback] Exchanging code for tokens", { reqId, hasState: true });

    const tokenRes = await exchangeCodeForToken(code);
    const mapped = mapStravaTokenResponse(tokenRes);

    // Persiste les tokens par athleteId (clé: tokens:{athleteId})
    await saveTokens(mapped.athlete_id, mapped);

    // Consomme l'état (évite réutilisation)
    await deleteOAuthState(state);

    logger.info("[callback] Tokens saved", {
      reqId,
      athleteId: mapped.athlete_id,
      expires_at: mapped.expires_at,
      t: `${Date.now() - t0}ms`,
    });

    // Tentative de retour dans la conversation (si tool_redirect_uri présent)
    const toolRedirect = stateRecord.tool_redirect_uri;
    if (toolRedirect) {
      try {
        // Validation basique de l'URL
        const safe = new URL(toolRedirect);
        logger.info("[callback] Redirecting to tool_redirect_uri", {
          reqId,
          href: safe.href,
        });
        return NextResponse.redirect(safe.href, { status: 302 });
      } catch {
        logger.warn("[callback] Invalid tool_redirect_uri in state, serving fallback HTML", {
          reqId,
          tool_redirect_uri: toolRedirect,
        });
        return renderFallbackHtml("Finalisation… Retour automatique indisponible.");
      }
    }

    // Aucun redirect connu → fallback HTML
    logger.warn("[callback] No tool_redirect_uri in state, serving fallback HTML", { reqId });
    return renderFallbackHtml("Finalisation… Retour automatique indisponible.");
  } catch (err: any) {
    logger.error("[callback] Token exchange failed", {
      reqId,
      err: String(err?.message || err),
      t: `${Date.now() - t0}ms`,
    });
    return NextResponse.json({ ok: false, error: "Token exchange failed" }, { status: 500 });
  }
}
