import { computeDivability } from './scoring';

export interface DayDivabilityScore {
  score: number;
  maxPossible: number;
  isPartial: boolean;
  quality: 'excellent' | 'good' | 'average' | 'poor';
  verdict: string;
  verdictColor: string;
}

function qualityFromVerdict(verdict: string): DayDivabilityScore['quality'] {
  if (verdict === 'Excellente') return 'excellent';
  if (verdict === 'Bonne')      return 'good';
  if (verdict === 'Moyenne')    return 'average';
  return 'poor';
}

export function computeDayDivabilityScore(
  date: string,
  weather: any,
  marineHorizonDate: string | null
): DayDivabilityScore {
  const isPartial = marineHorizonDate
    ? new Date(date + 'T12:00:00') > new Date(marineHorizonDate)
    : false;

  const noonStr = date + 'T12';
  const hourIdx = weather?.hourly?.time?.findIndex((t: string) => t >= noonStr) ?? -1;
  const hi = hourIdx >= 0 ? hourIdx : 0;

  const windKnots   = weather?.hourly?.windspeed_10m?.[hi]  ?? 0;
  const precipitation = weather?.hourly?.precipitation?.[hi] ?? 0;

  let waveHeight = 0;
  let seaTemp    = 12;
  let currentMs  = 0;

  if (!isPartial) {
    const marineIdx = weather?.marine?.hourly?.time?.findIndex((t: string) => t >= noonStr) ?? -1;
    const mi = marineIdx >= 0 ? marineIdx : 0;
    waveHeight = weather?.marine?.hourly?.wave_height?.[mi]              ?? 0;
    seaTemp    = weather?.marine?.hourly?.sea_surface_temperature?.[mi]  ?? 12;
    currentMs  = weather?.marine?.hourly?.ocean_current_velocity?.[mi]   ?? 0;
  }

  const result = computeDivability(
    { windKnots, waveHeight, precipitation, seaTemp, currentMs },
    { isPartial },
  );

  return {
    score:       result.score,
    maxPossible: result.maxPossible,
    isPartial:   result.isPartial,
    quality:     qualityFromVerdict(result.verdict),
    verdict:     result.verdict,
    verdictColor: result.verdictColor,
  };
}
