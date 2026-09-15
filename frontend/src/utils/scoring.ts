/**
 * scoring.ts — Source unique de calcul de plongeabilité
 *
 * Tous les composants (jauge, bannière, barre de jours) appellent computeDivability().
 * Aucun ne recalcule quoi que ce soit localement.
 *
 * Score max complet : 100 pts (vent 25 + vagues 30 + clarté 20 + temp 10 + courant 15)
 * Score max partiel  :  45 pts (vent 25 + clarté 20) — au-delà de l'horizon marin (~7 j)
 */

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
   * Score de classement des créneaux : inclut le bonus diurne (+10)
   * et le bonus courant faible à l'étale (+10 max).
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
// Barèmes internes
// ---------------------------------------------------------------------------

function scoreStep(value: number, thresholds: { below: number; pts: number }[]): number {
  for (const t of thresholds) {
    if (value < t.below) return t.pts;
  }
  return 0;
}

const WIND_THRESHOLDS  = [{ below: 8, pts: 25 }, { below: 12, pts: 20 }, { below: 15, pts: 10 }, { below: 20, pts: 5 }];
const WAVES_THRESHOLDS = [{ below: 0.3, pts: 30 }, { below: 0.5, pts: 25 }, { below: 0.8, pts: 18 }, { below: 1.2, pts: 10 }, { below: 1.5, pts: 4 }];
const CLARITY_THRESHOLDS = [{ below: 0.01, pts: 20 }, { below: 0.5, pts: 15 }, { below: 2, pts: 8 }, { below: 5, pts: 3 }];
const CURRENT_THRESHOLDS = [{ below: 0.3, pts: 15 }, { below: 0.6, pts: 12 }, { below: 1.0, pts: 7 }, { below: 1.5, pts: 3 }];

function scoreTemp(sst: number): number {
  if (sst >= 16) return 10;
  if (sst >= 12) return 8;
  if (sst >= 10) return 6;
  if (sst >= 8)  return 4;
  return 2;
}

function toVerdict(pct: number): Pick<DivabilityResult, 'verdict' | 'verdictColor' | 'verdictBg'> {
  if (pct >= 0.8) return { verdict: 'Excellente',   verdictColor: '#2dd4bf', verdictBg: 'bg-teal-900/30 border-teal-600/40' };
  if (pct >= 0.6) return { verdict: 'Bonne',        verdictColor: '#2dd4bf', verdictBg: 'bg-teal-900/30 border-teal-600/40' };
  if (pct >= 0.4) return { verdict: 'Moyenne',      verdictColor: '#f59e0b', verdictBg: 'bg-amber-900/30 border-amber-600/40' };
  if (pct >= 0.2) return { verdict: 'Déconseillée', verdictColor: '#ef4444', verdictBg: 'bg-red-900/30 border-red-600/40' };
  return             { verdict: 'Annulée',       verdictColor: '#991b1b', verdictBg: 'bg-red-900/30 border-red-600/40' };
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

  const windScore    = scoreStep(windEff, WIND_THRESHOLDS);
  const clarityScore = scoreStep(precipitation, CLARITY_THRESHOLDS);

  if (isPartial) {
    const score = windScore + clarityScore;
    const maxPossible = 45;
    const v = toVerdict(score / maxPossible);
    return {
      score,
      maxPossible,
      isPartial: true,
      ...v,
      rankingScore: score + daylightBonus + currentBonus,
      details: [
        { label: 'Vent',          value: formatWind(windKnots), score: windScore,    maxPts: 25 },
        { label: 'Clarté estimée', value: precipitation < 0.01 ? 'Favorable' : `${precipitation.toFixed(1)} mm/h`, score: clarityScore, maxPts: 20, note: 'proxy précip. surface' },
      ],
    };
  }

  const waveScore    = scoreStep(waveEff, WAVES_THRESHOLDS);
  const tempScore    = scoreTemp(seaTemp);
  const currentScore = scoreStep(currentEff, CURRENT_THRESHOLDS);

  const score = windScore + waveScore + clarityScore + tempScore + currentScore;
  const maxPossible = 100;
  const v = toVerdict(score / maxPossible);

  return {
    score,
    maxPossible,
    isPartial: false,
    ...v,
    rankingScore: score + daylightBonus + currentBonus,
    details: [
      { label: 'Vent',           value: formatWind(windKnots),  score: windScore,    maxPts: 25 },
      { label: 'Vagues',         value: `${waveHeight.toFixed(1)} m`, score: waveScore, maxPts: 30 },
      { label: 'Clarté estimée', value: precipitation < 0.01 ? 'Favorable' : `${precipitation.toFixed(1)} mm/h`, score: clarityScore, maxPts: 20, note: 'proxy précip. surface — ≠ visibilité sous-marine' },
      { label: 'Temp. mer',      value: fmtTemp(seaTemp),        score: tempScore,    maxPts: 10 },
      { label: 'Courant',        value: `${(currentMs * 1.944).toFixed(1)} kt`, score: currentScore, maxPts: 15 },
    ],
  };
}
