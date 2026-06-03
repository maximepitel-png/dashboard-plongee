/**
 * Tide data service — api-maree.fr (Ifremer/PREVIMER harmonic components)
 *
 * Requires env var: MAREE_API_KEY
 * Without a key, tides are unavailable (no fallback model).
 *
 * Endpoints used:
 *   GET /sites?key=...                                          → list of sites (slug + name)
 *   GET /water-levels?site=SLUG&from=...&to=...&step=N&tz=...&key=...  → heights array
 *
 * Constraints respected:
 *   - max 1500 points / request
 *   - window J−30..J+30
 *   - ≤ 360 requests / hour (cache 6h handles this easily)
 *
 * PM/BM detection: local extrema in 15-min curve, refined by parabolic interpolation (±2 min).
 * Tidal coefficient: estimated from marnage, calibrated for Ouistreham. NOT official SHOM value.
 */

import https from 'https';

// ── Public types ──────────────────────────────────────────────────────────────

export interface TidePoint {
  time: string;   // ISO 8601
  height: number; // metres above chart datum
}

export interface TideExtreme {
  time: string;
  height: number;
  type: 'high' | 'low';
}

export interface DayTides {
  date: string;
  coefficient: number;
  coefficientIsEstimate: true;
  extremes: TideExtreme[];
  points: TidePoint[];
  isApproximate: false; // api-maree.fr data is not approximate
  source: 'api-maree.fr';
}

// ── API-maree.fr response types ───────────────────────────────────────────────

interface MareeApiSite {
  id: string;   // slug used in /water-levels
  name: string;
  latitude?: number;
  longitude?: number;
}

interface MareeApiPoint {
  time: string;   // "2026-03-24T00:00:00+01:00"
  height: number; // metres
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

const BASE_URL = 'https://api-maree.fr';

function apiGet<T>(path: string): Promise<T> {
  const key = process.env.MAREE_API_KEY;
  if (!key) return Promise.reject(new Error('MAREE_API_KEY not set'));

  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${path}${sep}key=${encodeURIComponent(key)}`;

  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`api-maree.fr HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
            return;
          }
          const parsed = JSON.parse(data);
          // Log first response shape to help diagnose wrapping
          console.log(`[tides] Response shape for ${path.split('?')[0]}:`, JSON.stringify(parsed).slice(0, 200));
          // Unwrap common envelope patterns: { data: [...] }, { results: [...] }, { sites: [...] }, { waterLevels: [...] }
          let unwrapped: unknown = parsed;
          if (!Array.isArray(parsed) && typeof parsed === 'object' && parsed !== null) {
            const keys = Object.keys(parsed as object);
            if (keys.length === 1) {
              unwrapped = (parsed as Record<string, unknown>)[keys[0]];
            } else {
              // Try common field names
              const envelope = parsed as Record<string, unknown>;
              unwrapped = envelope['data'] ?? envelope['results'] ?? envelope['sites'] ??
                          envelope['waterLevels'] ?? envelope['water_levels'] ??
                          envelope['heights'] ?? envelope['hauteurs'] ?? parsed;
            }
          }
          resolve(unwrapped as T);
        } catch (e) {
          reject(new Error(`JSON parse error: ${(e as Error).message} — body: ${data.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('api-maree.fr timeout')); });
  });
}


// ── Site resolution ───────────────────────────────────────────────────────────

const OUISTREHAM_LAT = 49.2817;
const OUISTREHAM_LON = -0.2599;
const OUISTREHAM_FALLBACK_SLUG = 'ouistreham';

let resolvedSiteSlug: string | null = null;
let sitesLastFetched = 0;
const SITES_CACHE_TTL = 24 * 3600 * 1000; // 24h — site list is static

function dist(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return Math.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2);
}

async function resolveOuistrehamSlug(): Promise<string> {
  if (resolvedSiteSlug && Date.now() - sitesLastFetched < SITES_CACHE_TTL) {
    return resolvedSiteSlug;
  }

  try {
    const sites = await apiGet<MareeApiSite[]>('/sites');
    sitesLastFetched = Date.now();

    // Match by name first
    const byName = sites.find((s) =>
      s.name.toLowerCase().replace(/[-\s]/g, '').includes('ouistreham')
    );
    if (byName) {
      resolvedSiteSlug = byName.id;
      console.log(`[tides] Resolved Ouistreham → site slug "${resolvedSiteSlug}" (by name)`);
      return resolvedSiteSlug;
    }

    // Match by proximity if lat/lon available
    const withCoords = sites.filter((s) => s.latitude !== undefined && s.longitude !== undefined);
    if (withCoords.length > 0) {
      const nearest = withCoords.reduce((best, s) =>
        dist(s.latitude!, s.longitude!, OUISTREHAM_LAT, OUISTREHAM_LON) <
        dist(best.latitude!, best.longitude!, OUISTREHAM_LAT, OUISTREHAM_LON) ? s : best
      );
      resolvedSiteSlug = nearest.id;
      console.log(`[tides] Resolved Ouistreham → site slug "${resolvedSiteSlug}" (by proximity)`);
      return resolvedSiteSlug;
    }
  } catch (e) {
    console.warn(`[tides] /sites fetch failed, using fallback slug: ${(e as Error).message}`);
  }

  resolvedSiteSlug = OUISTREHAM_FALLBACK_SLUG;
  console.log(`[tides] Using fallback site slug "${resolvedSiteSlug}"`);
  return resolvedSiteSlug;
}

// ── Water level fetching ──────────────────────────────────────────────────────

function toIsoParam(d: Date): string {
  // YYYY-MM-DDTHH:MM (no seconds, no tz offset — tz sent separately)
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fetchWaterLevels(
  siteSlug: string,
  from: Date,
  to: Date,
  step: number
): Promise<MareeApiPoint[]> {
  // Clamp to J-30..J+30
  const now = new Date();
  const minDate = new Date(now.getTime() - 30 * 86400000);
  const maxDate = new Date(now.getTime() + 30 * 86400000);
  const clampedFrom = from < minDate ? minDate : from;
  const clampedTo = to > maxDate ? maxDate : to;

  if (clampedFrom >= clampedTo) return [];

  // Check point count
  const durationMin = (clampedTo.getTime() - clampedFrom.getTime()) / 60000;
  const points = Math.ceil(durationMin / step) + 1;

  if (points <= 1500) {
    // Single request
    const path = `/water-levels?site=${encodeURIComponent(siteSlug)}` +
      `&from=${toIsoParam(clampedFrom)}&to=${toIsoParam(clampedTo)}` +
      `&step=${step}&tz=Europe/Paris`;
    return apiGet<MareeApiPoint[]>(path);
  }

  // Split into chunks of max 1490 points each
  const chunkDurationMs = 1490 * step * 60 * 1000;
  const allPoints: MareeApiPoint[] = [];
  let cursor = clampedFrom.getTime();

  while (cursor < clampedTo.getTime()) {
    const chunkEnd = Math.min(cursor + chunkDurationMs, clampedTo.getTime());
    const path = `/water-levels?site=${encodeURIComponent(siteSlug)}` +
      `&from=${toIsoParam(new Date(cursor))}&to=${toIsoParam(new Date(chunkEnd))}` +
      `&step=${step}&tz=Europe/Paris`;
    const chunk = await apiGet<MareeApiPoint[]>(path);
    // Avoid duplicate boundary points
    const startIdx = allPoints.length > 0 ? 1 : 0;
    allPoints.push(...chunk.slice(startIdx));
    cursor = chunkEnd;
  }

  return allPoints;
}

// ── PM/BM detection via parabolic interpolation ───────────────────────────────

/**
 * Given 3 evenly-spaced heights (h0, h1, h2) with time t1 at center,
 * returns the refined peak time offset in milliseconds from t1, and the peak height.
 */
function parabolaRefine(t0: number, t1: number, t2: number, h0: number, h1: number, h2: number): { time: number; height: number } {
  const denom = 2 * h1 - h0 - h2;
  if (Math.abs(denom) < 1e-9) return { time: t1, height: h1 };
  const dt = t1 - t0; // step in ms
  const offset = (dt / 2) * (h0 - h2) / denom; // offset from t1
  const tPeak = t1 + offset;
  // Height at peak: parabola interpolation
  const hPeak = h1 + (h0 - h2) * (h0 - h2) / (8 * denom);
  return { time: tPeak, height: Math.max(0, hPeak) };
}

function detectExtremes(points: MareeApiPoint[]): TideExtreme[] {
  if (points.length < 3) return [];
  const extremes: TideExtreme[] = [];

  for (let i = 1; i < points.length - 1; i++) {
    const h0 = points[i - 1].height;
    const h1 = points[i].height;
    const h2 = points[i + 1].height;

    const isMax = h1 > h0 && h1 >= h2;
    const isMin = h1 < h0 && h1 <= h2;

    if (!isMax && !isMin) continue;

    const t0 = new Date(points[i - 1].time).getTime();
    const t1 = new Date(points[i].time).getTime();
    const t2 = new Date(points[i + 1].time).getTime();

    const { time: tPeak, height: hPeak } = parabolaRefine(t0, t1, t2, h0, h1, h2);

    extremes.push({
      time: new Date(tPeak).toISOString(),
      height: Math.round(hPeak * 100) / 100,
      type: isMax ? 'high' : 'low',
    });
  }

  return extremes;
}

// ── Coefficient estimation (Ouistreham calibration) ───────────────────────────

function estimateCoefficient(highHeight: number, lowHeight: number): number {
  const range = highHeight - lowHeight;
  // Ouistreham: spring max ~7.6m → coeff 120, neap min ~3.2m → coeff 20
  const coeff = 20 + ((range - 3.2) / (7.6 - 3.2)) * 100;
  return Math.round(Math.max(20, Math.min(120, coeff)));
}

// ── Data assembly ─────────────────────────────────────────────────────────────

function buildDayTides(
  allPoints: MareeApiPoint[],
  allExtremes: TideExtreme[],
  startDate: Date,
  days: number
): DayTides[] {
  const result: DayTides[] = [];

  for (let d = 0; d < days; d++) {
    const dayStart = new Date(startDate);
    dayStart.setDate(dayStart.getDate() + d);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const dateStr = dayStart.toISOString().split('T')[0];

    const dayPoints: TidePoint[] = allPoints
      .filter((p) => {
        const t = new Date(p.time).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      })
      .map((p) => ({ time: p.time, height: p.height }));

    const dayExtremes: TideExtreme[] = allExtremes.filter((e) => {
      const t = new Date(e.time).getTime();
      return t >= dayStart.getTime() && t < dayEnd.getTime();
    });

    const highs = dayExtremes.filter((e) => e.type === 'high');
    const lows = dayExtremes.filter((e) => e.type === 'low');
    const coeff =
      highs.length > 0 && lows.length > 0
        ? estimateCoefficient(highs[0].height, lows[0].height)
        : 60;

    result.push({
      date: dateStr,
      coefficient: coeff,
      coefficientIsEstimate: true,
      extremes: dayExtremes,
      points: dayPoints,
      isApproximate: false,
      source: 'api-maree.fr',
    });
  }

  return result;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface TidesCache {
  data: DayTides[];
  fetchedAt: number;
  days: number;
}

let tidesCache: TidesCache | null = null;
const CACHE_TTL_MS = 6 * 3600 * 1000;

// ── Public API ────────────────────────────────────────────────────────────────

export async function getTideData(days: number = 15): Promise<DayTides[]> {
  if (!process.env.MAREE_API_KEY) {
    throw new Error('MAREE_API_KEY non configurée — marées indisponibles');
  }

  const now = Date.now();
  if (tidesCache && tidesCache.days >= days && now - tidesCache.fetchedAt < CACHE_TTL_MS) {
    return tidesCache.data.slice(0, days);
  }

  const siteSlug = await resolveOuistrehamSlug();

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate.getTime() + days * 86400000);

  console.log(`[tides] Fetching api-maree.fr: site=${siteSlug}, ${days} days, step=15min`);
  const rawPoints = await fetchWaterLevels(siteSlug, startDate, endDate, 15);
  console.log(`[tides] Got ${rawPoints.length} points`);

  const allExtremes = detectExtremes(rawPoints);
  const result = buildDayTides(rawPoints, allExtremes, startDate, days);

  tidesCache = { data: result, fetchedAt: now, days };
  return result;
}

export async function getTidalImpact(timestamp: number): Promise<{ coefficient: number; risingTide: boolean }> {
  // Try to use cache first
  if (tidesCache) {
    const dayDate = new Date(timestamp);
    dayDate.setHours(0, 0, 0, 0);
    const dateStr = dayDate.toISOString().split('T')[0];
    const day = tidesCache.data.find((d) => d.date === dateStr);
    if (day && day.points.length >= 2) {
      const closest = day.points.reduce((prev, pt) =>
        Math.abs(new Date(pt.time).getTime() - timestamp) <
        Math.abs(new Date(prev.time).getTime() - timestamp) ? pt : prev
      );
      const idx = day.points.indexOf(closest);
      const next = day.points[Math.min(idx + 1, day.points.length - 1)];
      return {
        coefficient: day.coefficient,
        risingTide: next.height > closest.height,
      };
    }
  }

  // Minimal fetch for just this day at step=60 (24 points)
  if (!process.env.MAREE_API_KEY) return { coefficient: 60, risingTide: true };
  try {
    const siteSlug = await resolveOuistrehamSlug();
    const dayStart = new Date(timestamp);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const pts = await fetchWaterLevels(siteSlug, dayStart, dayEnd, 60);

    const exts = detectExtremes(pts);
    const highs = exts.filter((e) => e.type === 'high');
    const lows = exts.filter((e) => e.type === 'low');
    const coeff = highs.length > 0 && lows.length > 0
      ? estimateCoefficient(highs[0].height, lows[0].height) : 60;

    const nowPt = pts.reduce((prev, pt) =>
      Math.abs(new Date(pt.time).getTime() - timestamp) <
      Math.abs(new Date(prev.time).getTime() - timestamp) ? pt : prev
    );
    const idx = pts.indexOf(nowPt);
    const next = pts[Math.min(idx + 1, pts.length - 1)];
    return { coefficient: coeff, risingTide: next.height > nowPt.height };
  } catch {
    return { coefficient: 60, risingTide: true };
  }
}
