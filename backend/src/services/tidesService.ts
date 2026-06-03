/**
 * Tide data service for Ouistreham/Caen (English Channel)
 *
 * Priority:
 *   1. WorldTides API (worldtides.info) — accurate, set WORLDTIDES_API_KEY env var
 *   2. Local harmonic model — labelled "approximatif", ~3h drift possible
 *
 * WORLDTIDES_API_KEY: free tier = 200 calls/month, one call covers 15 days.
 */

import https from 'https';

export interface TidePoint {
  time: string; // ISO string
  height: number; // meters above chart datum
}

export interface TideExtreme {
  time: string;
  height: number;
  type: 'high' | 'low';
}

export interface DayTides {
  date: string;
  coefficient: number;
  extremes: TideExtreme[];
  points: TidePoint[];
  isApproximate?: boolean; // true when from local harmonic model
}

// ---------------------------------------------------------------------------
// WorldTides integration
// ---------------------------------------------------------------------------

const OUISTREHAM_LAT = 49.2817;
const OUISTREHAM_LON = -0.2599;

interface WorldTidesExtreme {
  dt: number;
  date: string;
  height: number;
  type: 'High' | 'Low';
}

interface WorldTidesHeights {
  dt: number;
  date: string;
  height: number;
}

interface WorldTidesResponse {
  status: number;
  extremes?: WorldTidesExtreme[];
  heights?: WorldTidesHeights[];
}

function fetchWorldTides(startUnix: number, lengthSec: number): Promise<WorldTidesResponse> {
  const key = process.env.WORLDTIDES_API_KEY;
  if (!key) return Promise.reject(new Error('No WORLDTIDES_API_KEY'));

  const url =
    `https://www.worldtides.info/api/v3?extremes&heights&step=900` +
    `&lat=${OUISTREHAM_LAT}&lon=${OUISTREHAM_LON}` +
    `&start=${startUnix}&length=${lengthSec}` +
    `&key=${key}`;

  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as WorldTidesResponse;
          if (parsed.status !== 200) {
            reject(new Error(`WorldTides status ${parsed.status}: ${data}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('WorldTides timeout'));
    });
  });
}

/**
 * Calculate SHOM tidal coefficient from high/low tide heights.
 * Calibrated for Ouistreham: spring max ~7.6m, neap min ~3.2m → coeff 20–120.
 */
function calculateCoefficient(highTide: number, lowTide: number): number {
  const range = highTide - lowTide;
  const maxRange = 7.6; // coeff 120
  const minRange = 3.2; // coeff 20
  const coeff = 20 + ((range - minRange) / (maxRange - minRange)) * 100;
  return Math.round(Math.max(20, Math.min(120, coeff)));
}

function groupExtremesPerDay(extremes: WorldTidesExtreme[], startDate: Date, days: number): DayTides[] {
  const result: DayTides[] = [];

  for (let d = 0; d < days; d++) {
    const dayStart = new Date(startDate.getTime() + d * 86400000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const dateStr = dayStart.toISOString().split('T')[0];

    const dayExtremes: TideExtreme[] = extremes
      .filter((e) => {
        const t = e.dt * 1000;
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      })
      .map((e) => ({
        time: new Date(e.dt * 1000).toISOString(),
        height: Math.round(e.height * 100) / 100,
        type: e.type === 'High' ? 'high' : 'low',
      }));

    const highs = dayExtremes.filter((e) => e.type === 'high');
    const lows = dayExtremes.filter((e) => e.type === 'low');
    const coeff =
      highs.length > 0 && lows.length > 0
        ? calculateCoefficient(highs[0].height, lows[0].height)
        : 60;

    result.push({
      date: dateStr,
      coefficient: coeff,
      extremes: dayExtremes,
      points: [], // filled later from heights
      isApproximate: false,
    });
  }

  return result;
}

function attachHeightsToPoints(days: DayTides[], heights: WorldTidesHeights[], startDate: Date): void {
  for (let d = 0; d < days.length; d++) {
    const dayStart = new Date(startDate.getTime() + d * 86400000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    days[d].points = heights
      .filter((h) => {
        const t = h.dt * 1000;
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      })
      .map((h) => ({
        time: new Date(h.dt * 1000).toISOString(),
        height: Math.round(h.height * 100) / 100,
      }));
  }
}

// ---------------------------------------------------------------------------
// Local harmonic fallback (Ouistreham, ~3h drift possible — labelled approximatif)
// ---------------------------------------------------------------------------

const CONSTITUENTS: [string, number, number, number][] = [
  ['M2', 3.405, 357.0, 28.9841042],
  ['S2', 1.098, 40.0, 30.0000000],
  ['N2', 0.645, 339.0, 28.4397295],
  ['K2', 0.296, 42.0, 30.0821373],
  ['K1', 0.106, 170.0, 15.0410686],
  ['O1', 0.082, 154.0, 13.9430356],
  ['M4', 0.115, 215.0, 57.9682084],
  ['MS4', 0.065, 228.0, 58.9841042],
  ['Mf', 0.030, 180.0, 1.0980331],
  ['L2', 0.098, 15.0, 29.5284789],
  ['MSf', 0.025, 0.0, 1.0158958],
  ['MN4', 0.045, 200.0, 57.4238337],
];

const MSL_OFFSET = 3.70;
const EPOCH_J2000 = new Date('2000-01-01T00:00:00Z').getTime();

function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function calculateTideHeight(timestamp: number): number {
  const hoursFromEpoch = (timestamp - EPOCH_J2000) / 3600000;
  let height = MSL_OFFSET;
  for (const [, amplitude, phase, speed] of CONSTITUENTS) {
    height += amplitude * Math.cos(deg2rad(speed * hoursFromEpoch + phase));
  }
  return Math.max(0, height);
}

function findExtremes(startMs: number, endMs: number): TideExtreme[] {
  const extremes: TideExtreme[] = [];
  const stepMs = 15 * 60 * 1000;
  let prevDiff = 0;

  for (let t = startMs + stepMs; t <= endMs; t += stepMs) {
    const diff = calculateTideHeight(t) - calculateTideHeight(t - stepMs);
    if (prevDiff > 0 && diff <= 0) {
      extremes.push(refineExtreme(t - stepMs, t, 'high'));
    } else if (prevDiff < 0 && diff >= 0) {
      extremes.push(refineExtreme(t - stepMs, t, 'low'));
    }
    prevDiff = diff;
  }
  return extremes;
}

function refineExtreme(startMs: number, endMs: number, type: 'high' | 'low'): TideExtreme {
  let lo = startMs;
  let hi = endMs;
  for (let i = 0; i < 20; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (type === 'high') {
      if (calculateTideHeight(m1) < calculateTideHeight(m2)) lo = m1;
      else hi = m2;
    } else {
      if (calculateTideHeight(m1) > calculateTideHeight(m2)) lo = m1;
      else hi = m2;
    }
  }
  const peakMs = (lo + hi) / 2;
  return {
    time: new Date(peakMs).toISOString(),
    height: Math.round(calculateTideHeight(peakMs) * 100) / 100,
    type,
  };
}

function getHarmonicTideData(days: number, startDate: Date): DayTides[] {
  const result: DayTides[] = [];
  for (let d = 0; d < days; d++) {
    const dayStart = new Date(startDate.getTime() + d * 86400000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    const points: TidePoint[] = [];
    for (let t = dayStart.getTime(); t < dayEnd.getTime(); t += 15 * 60 * 1000) {
      points.push({ time: new Date(t).toISOString(), height: Math.round(calculateTideHeight(t) * 100) / 100 });
    }

    const extremes = findExtremes(dayStart.getTime(), dayEnd.getTime());
    const highs = extremes.filter((e) => e.type === 'high');
    const lows = extremes.filter((e) => e.type === 'low');
    const coeff = highs.length > 0 && lows.length > 0 ? calculateCoefficient(highs[0].height, lows[0].height) : 60;

    result.push({
      date: dayStart.toISOString().split('T')[0],
      coefficient: coeff,
      extremes,
      points,
      isApproximate: true,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let cachedTides: { data: DayTides[]; fetchedAt: number; days: number } | null = null;
const CACHE_TTL_MS = 6 * 3600 * 1000; // 6 hours

export async function getTideData(days: number = 15): Promise<DayTides[]> {
  const now = Date.now();
  if (cachedTides && cachedTides.days >= days && now - cachedTides.fetchedAt < CACHE_TTL_MS) {
    return cachedTides.data.slice(0, days);
  }

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const startUnix = Math.floor(startDate.getTime() / 1000);
  const lengthSec = days * 86400;

  if (process.env.WORLDTIDES_API_KEY) {
    try {
      console.log('[tides] Fetching from WorldTides...');
      const wt = await fetchWorldTides(startUnix, lengthSec);
      const result = groupExtremesPerDay(wt.extremes ?? [], startDate, days);
      if (wt.heights) attachHeightsToPoints(result, wt.heights, startDate);
      cachedTides = { data: result, fetchedAt: now, days };
      console.log('[tides] WorldTides OK');
      return result;
    } catch (e) {
      console.warn('[tides] WorldTides failed, falling back to harmonic:', (e as Error).message);
    }
  } else {
    console.log('[tides] No WORLDTIDES_API_KEY — using approximate harmonic model');
  }

  const fallback = getHarmonicTideData(days, startDate);
  cachedTides = { data: fallback, fetchedAt: now, days };
  return fallback;
}

/**
 * Calculate divability impact from tides for a specific time
 */
export async function getTidalImpact(timestamp: number): Promise<{ coefficient: number; risingTide: boolean }> {
  const dayStart = new Date(timestamp);
  dayStart.setHours(0, 0, 0, 0);

  // Try to get from cache first
  if (cachedTides) {
    const dateStr = dayStart.toISOString().split('T')[0];
    const day = cachedTides.data.find((d) => d.date === dateStr);
    if (day) {
      const highs = day.extremes.filter((e) => e.type === 'high');
      const lows = day.extremes.filter((e) => e.type === 'low');
      const coeff = highs.length > 0 && lows.length > 0 ? calculateCoefficient(highs[0].height, lows[0].height) : day.coefficient;
      const now = calculateTideHeight(timestamp);
      const next = calculateTideHeight(timestamp + 3600000);
      return { coefficient: coeff, risingTide: next > now };
    }
  }

  // Harmonic fallback for impact
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const extremes = findExtremes(dayStart.getTime(), dayEnd.getTime());
  const highs = extremes.filter((e) => e.type === 'high');
  const lows = extremes.filter((e) => e.type === 'low');
  const coeff = highs.length > 0 && lows.length > 0 ? calculateCoefficient(highs[0].height, lows[0].height) : 60;
  return { coefficient: coeff, risingTide: calculateTideHeight(timestamp + 3600000) > calculateTideHeight(timestamp) };
}
