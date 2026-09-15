import { computeDivability } from './scoring';
import { VISIBILITY_BINOME_ALERT_M } from '../scoring/model';

export interface DayLightInfo {
  /** Tier lumineux à la profondeur du site à midi */
  tier: 'readable' | 'colors_gone' | 'lamp_needed' | 'black';
  /** Profondeur à partir de laquelle la plongée passe en obscurité (m) */
  darkDepthM: number;
  /** Visibilité horizontale estimée (m) */
  visibilityM: number;
  /** true si visibilité < seuil alerte binômage */
  binomeAlert: boolean;
}

export interface DayDivabilityScore {
  score: number;
  maxPossible: number;
  isPartial: boolean;
  quality: 'excellent' | 'good' | 'average' | 'poor';
  verdict: string;
  verdictColor: string;
  lightInfo?: DayLightInfo;
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
  marineHorizonDate: string | null,
  options?: { clarityInScore?: boolean },
): DayDivabilityScore {
  const isPartial = marineHorizonDate
    ? new Date(date + 'T12:00:00') > new Date(marineHorizonDate)
    : false;

  const noonStr = date + 'T12';
  const hourIdx = weather?.hourly?.time?.findIndex((t: string) => t >= noonStr) ?? -1;
  const hi = hourIdx >= 0 ? hourIdx : 0;

  const windKnots     = weather?.hourly?.windspeed_10m?.[hi]  ?? 0;
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

  // Clarté depuis le modèle Kd (clarity timeseries du backend)
  let visibilityM: number | undefined;
  let claritySource: string | undefined;
  let lightInfo: DayLightInfo | undefined;

  const clarityArr: any[] | undefined = weather?.clarity;
  if (clarityArr && clarityArr.length > 0) {
    const ci = clarityArr.findIndex((p: any) => p.time >= noonStr) ?? -1;
    const cp = ci >= 0 ? clarityArr[ci] : clarityArr[clarityArr.length - 1];
    if (cp) {
      visibilityM  = cp.visibilityM;
      claritySource = cp.source;
      if (cp.light) {
        lightInfo = {
          tier:        cp.light.tier,
          darkDepthM:  cp.light.darkDepthM,
          visibilityM: cp.visibilityM,
          binomeAlert: cp.visibilityM < VISIBILITY_BINOME_ALERT_M,
        };
      } else if (cp.visibilityM != null) {
        lightInfo = {
          tier:        cp.visibilityM >= 3 ? 'readable' : cp.visibilityM >= 1.5 ? 'colors_gone' : 'lamp_needed',
          darkDepthM:  99,
          visibilityM: cp.visibilityM,
          binomeAlert: cp.visibilityM < VISIBILITY_BINOME_ALERT_M,
        };
      }
    }
  }

  const result = computeDivability(
    { windKnots, waveHeight, precipitation, seaTemp, currentMs, visibilityM, claritySource },
    { isPartial, useVisibilityScore: options?.clarityInScore },
  );

  return {
    score:       result.score,
    maxPossible: result.maxPossible,
    isPartial:   result.isPartial,
    quality:     qualityFromVerdict(result.verdict),
    verdict:     result.verdict,
    verdictColor: result.verdictColor,
    lightInfo,
  };
}
