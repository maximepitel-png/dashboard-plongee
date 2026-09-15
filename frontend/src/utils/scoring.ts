/**
 * scoring.ts — Fonction unifiée de calcul de plongeabilité
 *
 * Toutes les constantes (facteurs, paliers, seuils) viennent de scoring/model.ts.
 * Ce fichier ne contient aucune valeur numérique métier.
 */

import { FACTORS, VERDICT_LEVELS, MAX_SCORE_FULL, MAX_SCORE_PARTIAL } from '../scoring/model';

export interface DivabilityConditions {
  windKnots: number;
  waveHeight: number;
  precipitation: number;
  seaTemp: number;
  currentMs: number;
}

export interface DivabilityOptions {
  /** Mode partiel : uniquement vent + clarté, max 45 pts */
  isPartial?: boolean;
  /**
   * Multiplicateurs d'exposition du site.
   * mult > 1 → site abrité (valeur effective réduite → meilleur score)
   * mult < 1 → site exposé (valeur effective augmentée → score dégradé)
   */
  multipliers?: {
    wind: number;
    swell: number;
    current: number;
  };
  /** Formateurs pour les libellés des détails (optionnel) */
  formatWind?: (kt: number) => string;
  formatTemp?: (c: number) => string;
  /**
   * Bonus de classement des créneaux (diurne + courant faible à l'étale).
   * N'influence pas le verdict affiché — uniquement le tri des fenêtres.
   */
  daylightBonus?: number;
  currentBonus?: number;
}

export interface DivabilityDetail {
  label: string;
  value: string;
  score: number;
  maxPts: number;
  note?: string;
}

export interface DivabilityResult {
  /** Score de plongeabilité (0-100 complet, 0-45 partiel) */
  score: number;
  /** Max possible selon le mode */
  maxPossible: number;
  isPartial: boolean;
  verdict: 'Excellente' | 'Bonne' | 'Moyenne' | 'Déconseillée' | 'Annulée';
  verdictColor: string;
  verdictBg: string;
  /**
   * Score de classement : score + daylightBonus + currentBonus.
   * Sert uniquement à trier les créneaux d'étale — ne pas afficher comme note.
   */
  rankingScore: number;
  details: DivabilityDetail[];
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function scoreStep(value: number, thresholds: { below: number; pts: number }[]): number {
  for (const t of thresholds) {
    if (value < t.below) return t.pts;
  }
  return 0;
}

function scoreTempManual(sst: number): number {
  // La température utilise une logique "above" ; on la gère manuellement
  // car les paliers model.ts l'indiquent ainsi.
  if (sst >= 16) return 10;
  if (sst >= 12) return 8;
  if (sst >= 10) return 6;
  if (sst >= 8)  return 4;
  return 2;
}

function toVerdict(pct: number): Pick<DivabilityResult, 'verdict' | 'verdictColor' | 'verdictBg'> {
  for (const level of VERDICT_LEVELS) {
    if (pct >= level.minPct) {
      return { verdict: level.label, verdictColor: level.color, verdictBg: level.bg };
    }
  }
  const last = VERDICT_LEVELS[VERDICT_LEVELS.length - 1];
  return { verdict: last.label, verdictColor: last.color, verdictBg: last.bg };
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

export function computeDivability(
  conditions: DivabilityConditions,
  options: DivabilityOptions = {},
): DivabilityResult {
  const {
    isPartial = false,
    multipliers = { wind: 1, swell: 1, current: 1 },
    formatWind = (kt: number) => `${Math.round(kt)} kt`,
    formatTemp: fmtTemp = (c: number) => `${Math.round(c)}°C`,
    daylightBonus = 0,
    currentBonus = 0,
  } = options;

  const { windKnots, waveHeight, precipitation, seaTemp, currentMs } = conditions;

  const windEff    = windKnots  / multipliers.wind;
  const waveEff    = waveHeight / multipliers.swell;
  const currentEff = currentMs  / multipliers.current;

  const windScore    = scoreStep(windEff,    FACTORS.wind.thresholds);
  const clarityScore = scoreStep(precipitation, FACTORS.clarity.thresholds);

  if (isPartial) {
    const score = windScore + clarityScore;
    const maxPossible = MAX_SCORE_PARTIAL;
    const v = toVerdict(score / maxPossible);
    return {
      score,
      maxPossible,
      isPartial: true,
      ...v,
      rankingScore: score + daylightBonus + currentBonus,
      details: [
        {
          label: FACTORS.wind.label,
          value: formatWind(windKnots),
          score: windScore,
          maxPts: FACTORS.wind.maxPts,
        },
        {
          label: FACTORS.clarity.label,
          value: precipitation < 0.01 ? 'Favorable' : `${precipitation.toFixed(1)} mm/h`,
          score: clarityScore,
          maxPts: FACTORS.clarity.maxPts,
          note: 'proxy précip. surface',
        },
      ],
    };
  }

  const waveScore    = scoreStep(waveEff,    FACTORS.waves.thresholds);
  const tempScore    = scoreTempManual(seaTemp);
  const currentScore = scoreStep(currentEff, FACTORS.current.thresholds);

  const score = windScore + waveScore + clarityScore + tempScore + currentScore;
  const maxPossible = MAX_SCORE_FULL;
  const v = toVerdict(score / maxPossible);

  return {
    score,
    maxPossible,
    isPartial: false,
    ...v,
    rankingScore: score + daylightBonus + currentBonus,
    details: [
      {
        label: FACTORS.wind.label,
        value: formatWind(windKnots),
        score: windScore,
        maxPts: FACTORS.wind.maxPts,
      },
      {
        label: FACTORS.waves.label,
        value: `${waveHeight.toFixed(1)} m`,
        score: waveScore,
        maxPts: FACTORS.waves.maxPts,
      },
      {
        label: FACTORS.clarity.label,
        value: precipitation < 0.01 ? 'Favorable' : `${precipitation.toFixed(1)} mm/h`,
        score: clarityScore,
        maxPts: FACTORS.clarity.maxPts,
        note: 'proxy précip. surface — ≠ visibilité sous-marine',
      },
      {
        label: FACTORS.temperature.label,
        value: fmtTemp(seaTemp),
        score: tempScore,
        maxPts: FACTORS.temperature.maxPts,
      },
      {
        label: FACTORS.current.label,
        value: `${(currentMs * 1.944).toFixed(1)} kt`,
        score: currentScore,
        maxPts: FACTORS.current.maxPts,
      },
    ],
  };
}
