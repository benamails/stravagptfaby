import { NextRequest } from "next/server";
import { genReqId, jsonOk, jsonError } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { readAthleteIndex } from "@/lib/redis";
import { getValidAccessToken } from "@/lib/tokens";
import { fetchAthlete } from "@/lib/strava";

export async function GET(req: NextRequest) {
  const reqId = genReqId();
  const t0 = Date.now();
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    if (!userId) return jsonError("Missing user_id", 400);

    const athleteId = await readAthleteIndex(userId);
    if (!athleteId) return jsonError("No athlete linked to this user_id", 404);

    const accessToken = await getValidAccessToken(athleteId);
    const raw = await fetchAthlete(accessToken);
    const athlete = {
      id: raw.id, username: raw.username, firstname: raw.firstname, lastname: raw.lastname,
      sex: raw.sex, weight: raw.weight, country: raw.country, city: raw.city,
      profile: raw.profile, updated_at: raw.updated_at
    };

    logger.info("[athlete] success", { reqId, userId, athleteId, t: `${Date.now() - t0}ms` });
    return jsonOk(athlete);
  } catch (err: any) {
    logger.error("[athlete] failed", { reqId, err: String(err?.message || err), t: `${Date.now() - t0}ms` });
    return jsonError("Failed to fetch athlete", 500);
  }
}
