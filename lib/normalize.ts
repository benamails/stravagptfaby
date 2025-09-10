export interface NormalizedActivity {
  id: number;
  name: string;
  date: string;
  suffer_score?: number | null;
  distance_km: number;
  time_moving: number;
  time_elapsed: number;
  avg_hr?: number | null;
  avg_watts?: number | null;
  elevation: number;
  year: number;
  month: number;
  week: number;
  type: string;
  commute: boolean;
  avg_cadence?: number | null;
  intensity?: number;
  charge?: number;
  year_week: string;
}

function getYearWeek(d: Date): { year: number; week: number; year_week: string } {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((+tmp - +yearStart) / 86400000 + 1) / 7);
  return { year: tmp.getUTCFullYear(), week, year_week: `${tmp.getUTCFullYear()}-${week}` };
}

export function normalizeActivity(raw: any): NormalizedActivity {
  const d = new Date(raw.start_date_local || raw.start_date);
  const { year, week, year_week } = getYearWeek(d);
  const distanceKm = raw.distance ? raw.distance / 1000 : 0;

  let intensity: number | undefined;
  if (raw.suffer_score && raw.moving_time > 0) intensity = raw.suffer_score / (raw.moving_time / 3600);

  let charge: number | undefined;
  if (intensity && distanceKm) charge = distanceKm * intensity;

  return {
    id: raw.id,
    name: raw.name,
    date: d.toISOString().slice(0, 16).replace("T", " "),
    suffer_score: raw.suffer_score ?? null,
    distance_km: distanceKm,
    time_moving: raw.moving_time,
    time_elapsed: raw.elapsed_time,
    avg_hr: raw.average_heartrate ?? null,
    avg_watts: raw.average_watts ?? null,
    elevation: raw.total_elevation_gain,
    year,
    month: d.getUTCMonth() + 1,
    week,
    type: raw.type,
    commute: !!raw.commute,
    avg_cadence: raw.average_cadence ?? null,
    intensity,
    charge,
    year_week
  };
}

export function normalizeActivities(raws: any[]): NormalizedActivity[] {
  return raws.map(normalizeActivity);
}
