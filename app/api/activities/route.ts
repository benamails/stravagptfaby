import { NextRequest } from "next/server";
import { genReqId, getAfterTimestamp, jsonOk, jsonError } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { getValidAccessToken } from "@/lib/tokens";
import { fetchActivities } from "@/lib/strava";
import { normalizeActivities } from "@/lib/normalize";
import { readAthleteIndex } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const reqId = genReqId();
  const t0 = Date.now();
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    const days = parseInt(url.searchParams.get("days") || "28", 10);
    if (!userId) return jsonError("Missing user_id", 400);

    const athleteId = await readAthleteIndex(userId);
    if (!athleteId) return jsonError("No athlete linked to this user_id", 404);

    const accessToken = await getValidAccessToken(athleteId);
    const after = getAfterTimestamp(days);
    const raw = await fetchActivities(accessToken, after);
    const activities = normalizeActivities(raw);

    logger.info("[activities] success", { reqId, userId, athleteId, count: activities.length, t: `${Date.now() - t0}ms` });
    return jsonOk(activities);
  } catch (err: any) {
    logger.error("[activities] failed", { reqId, err: String(err?.message || err), t: `${Date.now() - t0}ms` });
    return jsonError("Failed to fetch activities", 500);
  }
}
