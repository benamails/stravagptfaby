// api/activities/[id].js
import { verifyAppAuth } from '../_auth.js'
import { makeLogger } from '../_log.js'
import { stravaFetch } from '../_strava.js'

// ---------- helpers ----------
function isoWeek(d) {
  const dt = new Date(d)
  const t = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()))
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil((((t - yearStart) / 86400000) + 1) / 7)
  return { year: t.getUTCFullYear(), week: weekNum }
}

function toPaceSecondsPerKm(avg_speed_mps) {
  if (!avg_speed_mps || avg_speed_mps <= 0) return null
  const secPerKm = 1000 / avg_speed_mps
  return Math.round(secPerKm)
}

function mapDetail(a) {
  const start = a.start_date_local || a.start_date
  const d = new Date(start)
  const { year, week } = isoWeek(d)
  const month = d.getMonth() + 1

  const distance_m = Number(a.distance || 0)
  const moving_s = Number(a.moving_time || 0)
  const elapsed_s = Number(a.elapsed_time || 0)
  const avg_hr = a.has_heartrate ? (a.average_heartrate ?? null) : (a.average_heartrate ?? null)
  const avg_watts = a.average_watts ?? null
  const elev = Number(a.total_elevation_gain || 0)
  const commute = !!a.commute
  const cadence = a.average_cadence ?? null
  const suffer = a.suffer_score ?? null
  const intensity = (suffer && moving_s > 0) ? (suffer / (moving_s / 3600)) : null
  const distance_km = distance_m / 1000
  const charge = (intensity != null) ? (distance_km * intensity) : null
  const sport = a.sport_type || a.type || 'Run'

  const avg_speed = a.average_speed || (moving_s > 0 ? distance_m / moving_s : null)
  const pace_spkm = toPaceSecondsPerKm(avg_speed)

  return {
    id: a.id,
    name: a.name,
    date: start,
    suffer_score: suffer,
    distance_meter: distance_m,
    time_moving: moving_s,
    time_elapsed: elapsed_s,
    avg_hr: avg_hr,
    avg_watts: avg_watts,
    elevation: elev,
    year,
    month,
    week,
    type: sport,
    commute,
    avg_cadence: cadence,
    intensity,
    charge,
    year_week: `${year}-${String(week).padStart(2, '0')}`,

    // Champs "détail" (si présents dans le payload de base Strava)
    description: a.description || null,
    device_name: a.device_name || null,
    calories: a.calories ?? null,
    average_speed: avg_speed ?? null,   // m/s
    pace_sec_per_km: pace_spkm,        // s/km
    max_hr: a.max_heartrate ?? null,
    max_watts: a.max_watts ?? null,
    elapsed_seconds: elapsed_s,
    gear_id: a.gear_id || null,

    // Splits parfois fournis par Strava dans /activities/{id}
    splits_metric: a.splits_metric || null,
    splits_standard: a.splits_standard || null,

    // Laps et streams seront ajoutés dynamiquement plus bas si demandés
    laps: a.laps || null,
    best_efforts: a.best_efforts || null,
  }
}

// ---------- handler ----------
export default async function handler(req, res) {
  const log = makeLogger({ route: '/api/activities/[id]', method: req.method })
  try {
    if (req.method !== 'GET') return res.status(405).end()

    const auth = verifyAppAuth(req)
    if (!auth.ok) {
      log.warn('Unauthorized detail', { reason: auth.error })
      return res.status(401).json({ error: 'unauthorized', error_description: 'Bearer token missing or invalid' })
    }

    // Params
    const { id } = req.query || {}
    const q = req.query || {}
    const activityId = (id ?? '').toString().trim()
    if (!/^\d+$/.test(activityId)) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'Invalid activity id' })
    }

    const wantLaps = String(q.laps || '').toLowerCase() === 'true'
    const wantStreams = String(q.streams || '').toLowerCase() === 'true' || !!q.stream_keys
    const streamKeysCsv = (q.stream_keys || '').toString().trim()
    const defaultKeys = ['time', 'distance', 'latlng', 'heartrate']
    const streamKeys = streamKeysCsv
      ? streamKeysCsv.split(',').map(s => s.trim()).filter(Boolean)
      : defaultKeys

    log.info('Fetching activity detail', {
      sub: auth.sub, activityId, wantLaps, wantStreams, streamKeys
    })

    // 1) Détail de base (inclut souvent splits_* et parfois laps)
    let detailRaw
    try {
      const qs = new URLSearchParams({ include_all_efforts: 'false' })
      detailRaw = await stravaFetch(auth.sub, `/activities/${activityId}?${qs}`, log)
    } catch (e) {
      if (e.status === 404) {
        log.warn('Strava 404 on detail', { sub: auth.sub, activityId })
        return res.status(404).json({
          error: 'not_found',
          error_description: 'Activity not found or not visible with current scopes (activity:read_all may be required).'
        })
      }
      throw e
    }

    const out = mapDetail(detailRaw)

    // 2) Laps (endpoint dédié) si demandé
    if (wantLaps) {
      try {
        const laps = await stravaFetch(auth.sub, `/activities/${activityId}/laps`, log)
        out.laps = laps || null
        log.info('Laps fetched', { count: Array.isArray(laps) ? laps.length : 0 })
      } catch (e) {
        log.warn('Laps fetch failed', { status: e.status || null })
        // On n'échoue pas tout l'appel pour des laps manquants
      }
    }

    // 3) Streams (optionnel)
    if (wantStreams) {
      try {
        const p = new URLSearchParams()
        for (const k of streamKeys) p.append('keys[]', k)
        p.set('key_by_type', 'true')
        const streams = await stravaFetch(auth.sub, `/activities/${activityId}/streams?${p.toString()}`, log)
        // Avec key_by_type=true, Strava renvoie un objet { key: { original_size, resolution, series_type, data } }
        out.streams = streams || null
        log.info('Streams fetched', { keys: streamKeys })
      } catch (e) {
        log.warn('Streams fetch failed', { status: e.status || null })
      }
    }

    log.info('Activity detail complete', { sub: auth.sub, activityId })
    return res.status(200).json(out)
  } catch (e) {
    log.error('Detail failed', { error: String(e) })
    const msg = e?.data?.message || e.message || 'detail_failed'
    const status = e.status || 500
    return res.status(status).json({ error: 'server_error', error_description: msg })
  }
}
