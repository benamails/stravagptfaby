export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { genReqId } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { saveOAuthState } from "@/lib/redis";

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID!;
const APP_BASE_URL =
  process.env.APP_BASE_URL || "https://stravagptfaby.vercel.app";
const STRAVA_CALLBACK = `${APP_BASE_URL}/api/oauth/callback`;

export async function GET(req: NextRequest) {
  const reqId = genReqId();

  if (!STRAVA_CLIENT_ID) {
    logger.error("[openai-authorize] missing STRAVA_CLIENT_ID", { reqId });
    return NextResponse.json(
      { ok: false, error: "missing_env_STRAVA_CLIENT_ID" },
      { status: 500 }
    );
  }

  const url = new URL(req.url);

  // Params fournis par l’Action OpenAI
  const toolRedirectUri = url.searchParams.get("redirect_uri") || "";
  const actionId = url.searchParams.get("action_id") || "";

  // Optionnel: lier un user (string ou number)
  const userIdParam = url.searchParams.get("user_id");
  const userId =
    userIdParam && !Number.isNaN(Number(userIdParam))
      ? Number(userIdParam)
      : userIdParam || undefined;

  // Optionnel: override des scopes
  const scope = url.searchParams.get("scope") || "read,activity:read_all";

  // Construit l'objet state avec les champs requis par ton type
  type SaveStateArg = Parameters<typeof saveOAuthState>[1]; // infère le type attendu
  const statePayload: SaveStateArg = {
    // requis par ton OAuthStateRecord
    createdAt: Date.now(),
    // tes champs métier
    tool_redirect_uri: toolRedirectUri,
    action_id: actionId,
    user_id: userId,
    ts: Date.now(),
    nonce: crypto.randomUUID(),
  } as SaveStateArg;

  // Encodage base64url pour passer par Strava
  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

  try {
    await saveOAuthState(state, statePayload);
  } catch (e) {
    logger.error("[openai-authorize] saveOAuthState failed", {
      reqId,
      err: String(e),
    });
    return NextResponse.json(
      { ok: false, error: "state_persist_failed" },
      { status: 500 }
    );
  }

  // Redirection vers Strava — toujours vers TON callback backend
  const authorize = new URL("https://www.strava.com/oauth/authorize");
  authorize.searchParams.set("client_id", STRAVA_CLIENT_ID);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", STRAVA_CALLBACK);
  authorize.searchParams.set("scope", scope);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("approval_prompt", "auto");

  logger.info("[openai-authorize] redirecting to Strava", {
    reqId,
    toolRedirectUri_present: !!toolRedirectUri,
    strava_redirect_uri: STRAVA_CALLBACK,
    scope,
  });

  return NextResponse.redirect(authorize.toString(), { status: 302 });
}
