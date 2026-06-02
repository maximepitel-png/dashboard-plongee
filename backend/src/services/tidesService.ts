/**
 * Harmonic tide prediction for Ouistreham/Caen area (English Channel)
 * Using tidal harmonic constituents derived from SHOM data for Ouistreham.
 *
 * Reference datum: Chart Datum (LAT approximation)
 * Mean sea level at Ouistreham ~3.7m above chart datum
 *
 * Main constituents for Ouistreham (amplitudes in meters, phases in degrees):
 * Source: derived from SHOM harmonic analysis for Ouistreham port
 */

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
}

// Tidal constituents for Ouistreham
// Format: [name, amplitude_meters, phase_degrees_UTC, angular_speed_deg_per_hour]
const CONSTITUENTS: [string, number, number, number][] = [
  // Principal lunar semidiurnal (dominant in English Channel)
  ['M2', 3.405, 357.0, 28.9841042],
  // Principal solar semidiurnal
  ['S2', 1.098, 40.0, 30.0000000],
  // Larger lunar elliptic semidiurnal
  ['N2', 0.645, 339.0, 28.4397295],
  // Lunisolar semidiurnal
  ['K2', 0.296, 42.0, 30.0821373],
  // Lunar diurnal
  ['K1', 0.106, 170.0, 15.0410686],
  // Lunar diurnal
  ['O1', 0.082, 154.0, 13.9430356],
  // Shallow water overtide of M2
  ['M4', 0.115, 215.0, 57.9682084],
  // Compound tide
  ['MS4', 0.065, 228.0, 58.9841042],
  // Lunar fortnightly
  ['Mf', 0.030, 180.0, 1.0980331],
  // Larger lunar elliptic semidiurnal
  ['L2', 0.098, 15.0, 29.5284789],
  // Lunisolar fortnightly
  ['MSf', 0.025, 0.0, 1.0158958],
  // Shallow water quarter diurnal
  ['MN4', 0.045, 200.0, 57.4238337],
];

// Mean sea level at Ouistreham above chart datum (approximate)
const MSL_OFFSET = 3.70;

// Reference epoch: January 1, 2000, 00:00:00 UTC (J2000.0)
const EPOCH_J2000 = new Date('2000-01-01T00:00:00Z').getTime();

function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Calculate tide height at a given moment using harmonic constituents
 */
function calculateTideHeight(timestamp: number): number {
  const hoursFromEpoch = (timestamp - EPOCH_J2000) / 3600000;

  let height = MSL_OFFSET;
  for (const [, amplitude, phase, speed] of CONSTITUENTS) {
    const angle = speed * hoursFromEpoch + phase;
    height += amplitude * Math.cos(deg2rad(angle));
  }

  return Math.max(0, height);
}

/**
 * Find tide extremes (high/low water) between two timestamps using ternary search
 */
function findExtremes(startMs: number, endMs: number): TideExtreme[] {
  const extremes: TideExtreme[] = [];
  const stepMs = 15 * 60 * 1000; // 15-minute steps for initial scan

  let prevHeight = calculateTideHeight(startMs);
  let prevDiff = 0;

  for (let t = startMs + stepMs; t <= endMs; t += stepMs) {
    const height = calculateTideHeight(t);
    const diff = height - calculateTideHeight(t - stepMs);

    if (prevDiff > 0 && diff <= 0) {
      // Local maximum - refine
      const refined = refineExtreme(t - stepMs, t, 'high');
      extremes.push(refined);
    } else if (prevDiff < 0 && diff >= 0) {
      // Local minimum - refine
      const refined = refineExtreme(t - stepMs, t, 'low');
      extremes.push(refined);
    }

    prevHeight = height;
    prevDiff = diff;
  }

  return extremes;
}

function refineExtreme(startMs: number, endMs: number, type: 'high' | 'low'): TideExtreme {
  // Binary search refinement (1 minute precision)
  let lo = startMs;
  let hi = endMs;

  for (let i = 0; i < 20; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    const h1 = calculateTideHeight(m1);
    const h2 = calculateTideHeight(m2);

    if (type === 'high') {
      if (h1 < h2) lo = m1;
      else hi = m2;
    } else {
      if (h1 > h2) lo = m1;
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

/**
 * Calculate tidal coefficient (coeff de marée)
 * French tidal coefficient scale: 20 (neap) to 120 (spring)
 * Based on ratio of current tidal range to maximum tidal range
 * At Ouistreham: max spring range ~8.5m, typical neap range ~3.5m
 */
function calculateCoefficient(highTide: number, lowTide: number): number {
  const range = highTide - lowTide;
  // Max spring range at Ouistreham is about 7.6m (coefficient 120)
  // Neap range about 3.5m (coefficient 20)
  const maxRange = 7.6;
  const minRange = 3.5;
  const coeff = 20 + ((range - minRange) / (maxRange - minRange)) * 100;
  return Math.round(Math.max(20, Math.min(120, coeff)));
}

/**
 * Generate tide data for N days from now
 */
export function getTideData(days: number = 7, startDate?: Date): DayTides[] {
  const start = startDate || new Date();
  start.setHours(0, 0, 0, 0);

  const result: DayTides[] = [];

  for (let d = 0; d < days; d++) {
    const dayStart = new Date(start.getTime() + d * 86400000);
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    // Generate hourly points for the graph (15-min intervals)
    const points: TidePoint[] = [];
    for (let t = dayStart.getTime(); t < dayEnd.getTime(); t += 15 * 60 * 1000) {
      points.push({
        time: new Date(t).toISOString(),
        height: Math.round(calculateTideHeight(t) * 100) / 100,
      });
    }

    // Find extremes for this day
    const extremes = findExtremes(dayStart.getTime(), dayEnd.getTime());

    // Calculate coefficient from the first high-low pair
    let coefficient = 60; // default
    const highs = extremes.filter((e) => e.type === 'high');
    const lows = extremes.filter((e) => e.type === 'low');
    if (highs.length > 0 && lows.length > 0) {
      coefficient = calculateCoefficient(highs[0].height, lows[0].height);
    }

    result.push({
      date: dayStart.toISOString().split('T')[0],
      coefficient,
      extremes,
      points,
    });
  }

  return result;
}

/**
 * Calculate divability impact from tides for a specific time
 */
export function getTidalImpact(timestamp: number): { coefficient: number; risingTide: boolean } {
  const now = timestamp;
  const soon = timestamp + 3600000;
  const currentHeight = calculateTideHeight(now);
  const nextHeight = calculateTideHeight(soon);

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86400000);

  const extremes = findExtremes(dayStart.getTime(), dayEnd.getTime());
  const highs = extremes.filter((e) => e.type === 'high');
  const lows = extremes.filter((e) => e.type === 'low');

  let coefficient = 60;
  if (highs.length > 0 && lows.length > 0) {
    coefficient = calculateCoefficient(highs[0].height, lows[0].height);
  }

  return {
    coefficient,
    risingTide: nextHeight > currentHeight,
  };
}
