export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { genReqId, renderFallbackHtml } from "@/lib/utils";
import { logger } from "@/lib/logger";
import {
  readOAuthState,
  deleteOAuthState,
  saveTokens,
  saveAthleteIndex,
} from "@/lib/redis";
import { exchangeCodeForToken } from "@/lib/strava";
import { mapStravaTokenResponse } from "@/lib/tokens";

const APP_BASE_URL =
  process.env.APP_BASE_URL || "https://stravagptfaby.vercel.app";
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
    return NextResponse.json(
      { ok: false, error: "missing_code_or_state" },
      { status: 400 }
    );
  }

  const stateRecord = await readOAuthState(state);
  if (!stateRecord) {
    logger.warn("[callback] invalid_state", { reqId, state });
    return NextResponse.json(
      { ok: false, error: "invalid_state" },
      { status: 400 }
    );
  }

  // On peut consommer l’état maintenant
  await deleteOAuthState(state);

  // ⚠️ Toutes les lectures passent par un indexation sûre :
  const s = stateRecord as Record<string, unknown>;
  const toolRedirect =
    typeof s["tool_redirect_uri"] === "string"
      ? (s["tool_redirect_uri"] as string)
      : undefined;
  const actionId =
    (typeof s["action_id"] === "string"
      ? (s["action_id"] as string)
      : undefined) ??
    (typeof s["openai_action_id"] === "string"
      ? (s["openai_action_id"] as string)
      : undefined);
  const userId =
    typeof s["user_id"] === "string" || typeof s["user_id"] === "number"
      ? (s["user_id"] as string | number)
      : undefined;

  try {
    // ⚠️ exchangeCodeForToken doit POST avec redirect_uri = STRAVA_CALLBACK
    const tokenRes = await exchangeCodeForToken(code);
    const mapped = mapStravaTokenResponse(tokenRes);

    await saveTokens(mapped.athlete_id, mapped);

    if (userId) {
      await saveAthleteIndex(userId, mapped.athlete_id);
      logger.info("[callback] athlete index saved", {
        reqId,
        user_id: userId,
        athlete_id: mapped.athlete_id,
      });
    }

    logger.info("[callback] tokens saved", {
      reqId,
      athlete_id: mapped.athlete_id,
      expires_at: mapped.expires_at,
      t: `${Date.now() - t0}ms`,
    });

    if (toolRedirect) {
      try {
        const back = new URL(toolRedirect);
        if (actionId) back.searchParams.set("action_id", String(actionId));
        back.searchParams.set("ok", "1");
        logger.info("[callback] redirecting back to tool", {
          reqId,
          to: back.toString(),
        });
        return NextResponse.redirect(back.toString(), { status: 302 });
      } catch {
        logger.warn("[callback] bad tool_redirect_uri", {
          reqId,
          toolRedirect,
        });
        return renderFallbackHtml(
          "Finalisation… Retour automatique indisponible."
        );
      }
    }

    // Pas de tool_redirect_uri → fallback HTML
    return renderFallbackHtml(
      "Finalisation… Retour automatique indisponible."
    );
  } catch (err: any) {
    const name = err?.name || err?.constructor?.name;
    if (name === "StravaHttpError") {
      logger.error("[callback] provider_400", {
        reqId,
        where: err.where,
        status: err.status,
        body: err.body,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "provider_400",
          provider: { where: err.where, status: err.status, body: err.body },
        },
        { status: 502 }
      );
    }
    logger.error("[callback] token_exchange_failed", {
      reqId,
      err: String(err),
    });
    return NextResponse.json(
      { ok: false, error: "token_exchange_failed" },
      { status: 502 }
    );
  }
}
