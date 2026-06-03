export interface DayDivabilityScore {
  score: number;          // 0-100 if full data, 0-45 if partial
  maxPossible: number;    // 100 or 45 (partial)
  isPartial: boolean;
  quality: 'excellent' | 'good' | 'average' | 'poor';
  verdict: string;        // 'Excellente' | 'Bonne' | 'Moyenne' | 'Déconseillée' | 'Annulée'
  verdictColor: string;
}

function scoreWind(kt: number): number {
  if (kt < 8) return 25;
  if (kt < 12) return 20;
  if (kt < 15) return 10;
  if (kt < 20) return 5;
  return 0;
}

function scoreWaves(m: number): number {
  if (m < 0.3) return 30;
  if (m < 0.5) return 25;
  if (m < 0.8) return 18;
  if (m < 1.2) return 10;
  if (m < 1.5) return 4;
  return 0;
}

function scoreClarity(precip: number): number {
  if (precip < 0.01) return 20;
  if (precip < 0.5) return 15;
  if (precip < 2) return 8;
  if (precip < 5) return 3;
  return 0;
}

function scoreTemp(sst: number): number {
  if (sst >= 16) return 10;
  if (sst >= 12) return 8;
  if (sst >= 10) return 6;
  if (sst >= 8) return 4;
  return 2;
}

function scoreCurrent(ms: number): number {
  if (ms < 0.3) return 15;
  if (ms < 0.6) return 12;
  if (ms < 1.0) return 7;
  if (ms < 1.5) return 3;
  return 0;
}

function toQuality(score: number, max: number): { quality: DayDivabilityScore['quality']; verdict: string; verdictColor: string } {
  const pct = score / max;
  if (pct >= 0.8) return { quality: 'excellent', verdict: 'Excellente', verdictColor: '#2dd4bf' };
  if (pct >= 0.6) return { quality: 'good', verdict: 'Bonne', verdictColor: '#2dd4bf' };
  if (pct >= 0.4) return { quality: 'average', verdict: 'Moyenne', verdictColor: '#f59e0b' };
  if (pct >= 0.2) return { quality: 'poor', verdict: 'Déconseillée', verdictColor: '#ef4444' };
  return { quality: 'poor', verdict: 'Annulée', verdictColor: '#991b1b' };
}

export function computeDayDivabilityScore(
  date: string,
  weather: any,
  marineHorizonDate: string | null
): DayDivabilityScore {
  const isPartial = marineHorizonDate
    ? new Date(date + 'T12:00:00') > new Date(marineHorizonDate)
    : false;

  // Find noon index in hourly forecast
  const noonStr = date + 'T12';
  const hourIdx = weather?.hourly?.time?.findIndex((t: string) => t >= noonStr) ?? -1;
  const hi = hourIdx >= 0 ? hourIdx : 0;

  const wind = weather?.hourly?.windspeed_10m?.[hi] ?? 0;
  const precip = weather?.hourly?.precipitation?.[hi] ?? 0;

  if (isPartial) {
    const score = scoreWind(wind) + scoreClarity(precip);
    const max = 45;
    const q = toQuality(score, max);
    return { score, maxPossible: max, isPartial: true, ...q };
  }

  // Find noon in marine
  const marineIdx = weather?.marine?.hourly?.time?.findIndex((t: string) => t >= noonStr) ?? -1;
  const mi = marineIdx >= 0 ? marineIdx : 0;

  const waves = weather?.marine?.hourly?.wave_height?.[mi] ?? 0;
  const seaTemp = weather?.marine?.hourly?.sea_surface_temperature?.[mi] ?? 12;
  const currentMs = weather?.marine?.hourly?.ocean_current_velocity?.[mi] ?? 0;

  const score = scoreWind(wind) + scoreWaves(waves) + scoreClarity(precip) + scoreTemp(seaTemp) + scoreCurrent(currentMs);
  const max = 100;
  const q = toQuality(score, max);
  return { score, maxPossible: max, isPartial: false, ...q };
}
