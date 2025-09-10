import { NextRequest } from "next/server";
import { genReqId, jsonOk, jsonError } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { readAthleteIndex } from "@/lib/redis";
import { getValidAccessToken } from "@/lib/tokens";
import { fetchActivity } from "@/lib/strava";
import { normalizeActivity } from "@/lib/normalize";

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const reqId = genReqId();
  const t0 = Date.now();
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    const id = ctx.params.id;

    if (!userId) return jsonError("Missing user_id", 400);
    if (!id) return jsonError("Missing activity id", 400);

    const athleteId = await readAthleteIndex(userId);
    if (!athleteId) return jsonError("No athlete linked to this user_id", 404);

    const accessToken = await getValidAccessToken(athleteId);
    const raw = await fetchActivity(accessToken, id);
    const activity = normalizeActivity(raw);

    logger.info("[activity] success", { reqId, userId, athleteId, id, t: `${Date.now() - t0}ms` });
    return jsonOk(activity);
  } catch (err: any) {
    logger.error("[activity] failed", { reqId, id: ctx?.params?.id, err: String(err?.message || err), t: `${Date.now() - t0}ms` });
    return jsonError("Failed to fetch activity", 500);
  }
}
