/**
 * clarityService.ts — Modèle de clarté de l'eau pour Ouistreham
 *
 * Calcule un coefficient d'atténuation diffuse Kd (m⁻¹) par pas horaire.
 * Visibilité estimée : visibilityM ≈ 2.04 / Kd
 *
 * Hiérarchie des sources (par ordre de priorité décroissante) :
 *   1. Satellite Copernicus (KD490/ZSD) — si ./data/satellite_clarity.json < 3 jours
 *   2. Modèle calculé (prompt 3) : panache Orne + remise en suspension houle + phytoplancton
 *   3. Climatologie mensuelle seule
 *
 * Note sur CHL/SPM Copernicus :
 *   En eaux côtières turbides (Manche orientale), CHL est biaisée vers le haut
 *   par la réflectance des sédiments et de la CDOM. Seuls ZSD et KD490 alimentent
 *   le calcul de Kd ; CHL et SPM servent uniquement à attribuer la cause
 *   (bloom vs sédiment) pour l'affichage — jamais comme entrée quantitative.
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import NodeCache from 'node-cache';
import { solarElevation, computeLightProfile, LightProfile } from './lightModel';

// ---------------------------------------------------------------------------
// Constantes site
// ---------------------------------------------------------------------------

/** Profondeur moyenne du site de plongée d'Ouistreham (m) */
const SITE_DEPTH_M = 12;

/** Kd de fond (eau claire, Manche : ~0.08 m⁻¹) */
const KD_BACKGROUND = 0.08;

/** Chemin du fichier JSON produit par le job Copernicus */
const SATELLITE_FILE = path.join(
  process.env.DATA_DIR ?? path.join(__dirname, '../../..', 'data'),
  'satellite_clarity.json',
);

/** Un fichier satellite de plus de 3 jours est considéré trop ancien */
const SATELLITE_MAX_AGE_MS = 3 * 24 * 3600 * 1000;

/**
 * Station débitmètre repli : L'Orne à Caen — Pont de Vaucelles (H1422510).
 * Vérifiée comme la station la plus aval active sur l'Orne dans le Calvados
 * via le référentiel Hub'Eau. Si le référentiel retourne une station plus aval
 * au runtime, elle sera préférée.
 */
const FALLBACK_STATION_CODE = 'H1422510';

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

/** Cache Hub'Eau — données élaborées (quantiles) : 24 h */
const hubEauCache = new NodeCache({ stdTTL: 86400 });

/** Cache résultat clarity : 1 h */
const clarityCache = new NodeCache({ stdTTL: 3600 });

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export interface ClarityPoint {
  time: string;       // ISO 8601
  kd: number;        // m⁻¹ (coefficient d'atténuation diffuse)
  visibilityM: number; // ≈ 2.04 / kd
  source: string;    // libellé des contributions actives
  confidence: number; // 0-1
  light?: LightProfile; // profil lumineux sous-marin (si shortwave disponible)
}

// ---------------------------------------------------------------------------
// Contribution 1 — Panache de l'Orne
// ---------------------------------------------------------------------------

interface StationInfo {
  code: string;
  name: string;
  lat: number;
  lon: number;
}

async function resolveOrneStation(): Promise<string> {
  const cached = hubEauCache.get<string>('orne_station_code');
  if (cached) return cached;

  try {
    const res = await axios.get('https://hubeau.eaufrance.fr/api/v1/hydrometrie/referentiel/stations', {
      params: {
        code_departement: '14',
        libelle_cours_eau: 'Orne',
        fields: 'code_station,libelle_station,longitude_station,latitude_station,altitude_ref_alti',
        size: 100,
      },
      timeout: 8000,
    });

    const stations: StationInfo[] = (res.data?.data ?? []).map((s: any) => ({
      code: s.code_station,
      name: s.libelle_station,
      lat:  s.latitude_station,
      lon:  s.longitude_station,
    }));

    if (stations.length === 0) throw new Error('no stations');

    // La station la plus aval = la plus proche de la mer = longitude la plus à l'est
    // (l'Orne coule vers le nord-ouest — longitude croissante vers l'ouest)
    // On cherche celle la plus proche de l'embouchure (Ouistreham ≈ -0.246°)
    const nearest = stations.reduce((best, s) => {
      const distBest = Math.abs(best.lon - (-0.246));
      const distS    = Math.abs(s.lon   - (-0.246));
      return distS < distBest ? s : best;
    });

    hubEauCache.set('orne_station_code', nearest.code, 86400 * 7);
    return nearest.code;
  } catch {
    return FALLBACK_STATION_CODE;
  }
}

/**
 * Récupère les quantiles mensuels du débit (m³/s) pour la station.
 * Retourne un tableau [jan, fev, mar, avr, mai, jun, jul, aou, sep, oct, nov, dec]
 * avec la médiane estimée par mois.
 */
async function getMonthlyMedians(stationCode: string): Promise<number[]> {
  const cacheKey = `orne_medians_${stationCode}`;
  const cached = hubEauCache.get<number[]>(cacheKey);
  if (cached) return cached;

  // Climatologie de repli pour l'Orne à Caen (m³/s, médianes mensuelles estimées)
  // Source : données Banque Hydro historiques, station H1422510
  const FALLBACK_MEDIANS = [65, 70, 60, 45, 30, 20, 12, 10, 14, 25, 45, 60];

  try {
    // Hub'Eau /observations_tr : on récupère les 2 dernières années pour calculer
    // les quantiles mensuels empiriquement
    const since = new Date();
    since.setFullYear(since.getFullYear() - 2);
    const res = await axios.get(
      'https://hubeau.eaufrance.fr/api/v1/hydrometrie/obs_elab',
      {
        params: {
          code_entite: stationCode,
          grandeur_hydro_elab: 'QmJ',          // débit moyen journalier
          date_debut_obs_elab: since.toISOString().slice(0, 10),
          fields: 'date_obs_elab,resultat_obs_elab',
          size: 1000,
        },
        timeout: 10000,
      }
    );

    const obs: { date_obs_elab: string; resultat_obs_elab: number }[] =
      res.data?.data ?? [];

    if (obs.length < 30) throw new Error('insufficient data');

    // Calcul des médianes par mois
    const byMonth: number[][] = Array.from({ length: 12 }, () => []);
    for (const o of obs) {
      const month = new Date(o.date_obs_elab).getMonth();
      if (o.resultat_obs_elab != null) byMonth[month].push(o.resultat_obs_elab);
    }

    const medians = byMonth.map((vals) => {
      if (vals.length === 0) return FALLBACK_MEDIANS[0];
      const sorted = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    });

    // Remplace les mois sans données par la valeur de repli
    const result = medians.map((v, i) => (v > 0 ? v : FALLBACK_MEDIANS[i]));
    hubEauCache.set(cacheKey, result, 86400 * 7);
    return result;
  } catch {
    hubEauCache.set(cacheKey, FALLBACK_MEDIANS, 3600);
    return FALLBACK_MEDIANS;
  }
}

/** Mémoire exponentielle — constante de temps τ en heures */
function expMemory(values: number[], times: string[], tau: number, now: Date): number {
  if (values.length === 0) return 0;
  let acc = 0;
  let wSum = 0;
  for (let i = 0; i < values.length; i++) {
    const t = new Date(times[i]);
    const dtH = (now.getTime() - t.getTime()) / 3_600_000;
    if (dtH < 0) continue; // données futures ignorées
    const w = Math.exp(-dtH / tau);
    acc  += values[i] * w;
    wSum += w;
  }
  return wSum > 0 ? acc / wSum : values[values.length - 1] ?? 0;
}

/**
 * Contribution Orne : Kd_orne en m⁻¹
 * Proportionne à l'écart relatif débit/médiane, calibré empiriquement :
 *   rapport = Q / Qmedian → Kd_orne = 0.12 * (rapport - 1) si rapport > 1 sinon 0
 *   plafonné à 0.30 m⁻¹
 */
async function computeKdOrne(
  hourlyTimes: string[],
  now: Date,
): Promise<{ kd: number; confidence: number }> {
  try {
    const stationCode = await resolveOrneStation();
    const medians = await getMonthlyMedians(stationCode);

    // Débit actuel — on récupère les 4 derniers jours
    const since = new Date(now.getTime() - 4 * 86400000);
    const res = await axios.get(
      'https://hubeau.eaufrance.fr/api/v1/hydrometrie/obs_elab',
      {
        params: {
          code_entite: stationCode,
          grandeur_hydro_elab: 'QmJ',
          date_debut_obs_elab: since.toISOString().slice(0, 10),
          fields: 'date_obs_elab,resultat_obs_elab',
          size: 10,
        },
        timeout: 8000,
      }
    );

    const obs: { date_obs_elab: string; resultat_obs_elab: number }[] =
      res.data?.data ?? [];

    if (obs.length === 0) throw new Error('no recent obs');

    // Mémoire exponentielle τ = 60 h sur le débit journalier
    const vals  = obs.map((o) => o.resultat_obs_elab);
    const times = obs.map((o) => o.date_obs_elab);
    const qSmoothed = expMemory(vals, times, 60, now);

    const month  = now.getMonth();
    const qMed   = medians[month] > 0 ? medians[month] : 30;
    const ratio  = qSmoothed / qMed;
    const kd     = ratio > 1 ? Math.min(0.30, 0.12 * (ratio - 1)) : 0;

    return { kd, confidence: 1 };
  } catch {
    // Dégrade silencieusement : contribution nulle, confiance réduite
    return { kd: 0, confidence: 0.5 };
  }
}

// ---------------------------------------------------------------------------
// Contribution 2 — Remise en suspension par la houle
// ---------------------------------------------------------------------------

/**
 * Vitesse orbitale au fond (m/s) selon la théorie linéaire des vagues.
 * Ub = π·Hs / (T · sinh(2π·h / L))
 * où L est la longueur d'onde solution de la relation de dispersion :
 *   ω² = g·k·tanh(k·h),  ω = 2π/T,  k = 2π/L
 *
 * @param Hs   Hauteur significative (m)
 * @param T    Période (s)
 * @param h    Profondeur (m)
 */
export function orbitalVelocityBottom(Hs: number, T: number, h: number): number {
  if (T <= 0 || h <= 0 || Hs <= 0) return 0;

  const g = 9.81;
  const omega = (2 * Math.PI) / T;

  // Résolution itérative de la relation de dispersion : k (nombre d'onde, rad/m)
  // Approximation initiale en eau profonde
  let k = omega * omega / g;
  for (let i = 0; i < 50; i++) {
    const f  = omega * omega - g * k * Math.tanh(k * h);
    const df = -g * (Math.tanh(k * h) + k * h / Math.pow(Math.cosh(k * h), 2));
    const dk = -f / df;
    k += dk;
    if (Math.abs(dk) < 1e-8) break;
  }

  const sinhArg = Math.sinh(2 * Math.PI * h / ((2 * Math.PI) / k));
  if (!isFinite(sinhArg) || sinhArg <= 0) return 0;

  const Ub = (Math.PI * Hs) / (T * sinhArg);
  return isFinite(Ub) ? Math.max(0, Ub) : 0;
}

/**
 * Contribution remise en suspension : Kd_wave en m⁻¹
 * Seuil de mise en mouvement des sédiments : Ub_crit ~ 0.10 m/s (sable fin)
 * Kd_wave = 0.25 * max(0, Ub - Ub_crit) / (1 - Ub_crit)  [plafonné à 0.20]
 */
function computeKdWave(
  marineHourly: {
    time: string[];
    wave_height: number[];
    wave_period: number[];
  },
  now: Date,
): number {
  const UB_CRIT = 0.10;
  const times = marineHourly.time;
  const heights = marineHourly.wave_height;
  const periods = marineHourly.wave_period;

  if (!times || times.length === 0) return 0;

  // On collecte les Ub horaires des 48 dernières heures
  const ubValues: number[] = [];
  const ubTimes: string[]  = [];

  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]);
    const dtH = (now.getTime() - t.getTime()) / 3_600_000;
    if (dtH < 0 || dtH > 48) continue;
    const Hs = heights[i] ?? 0;
    const T  = periods[i] ?? 8;
    const Ub = orbitalVelocityBottom(Hs, T, SITE_DEPTH_M);
    ubValues.push(Ub);
    ubTimes.push(times[i]);
  }

  // Mémoire exponentielle τ = 24 h
  const ubSmoothed = expMemory(ubValues, ubTimes, 24, now);

  const excess = Math.max(0, ubSmoothed - UB_CRIT);
  return Math.min(0.20, 0.25 * excess / (1 - UB_CRIT));
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Source satellite Copernicus (priorité 1)
// ---------------------------------------------------------------------------

interface SatellitePoint {
  date:        string;         // YYYY-MM-DD
  kd:          number | null;  // Kd composite (KD490 ou dérivé de ZSD)
  kd_source:   string;
  kd490:       number | null;
  kd_from_zsd: number | null;
  zsd:         number | null;
  chl:         number | null;  // informative seulement (peu fiable en eaux turbides côtières)
  spm:         number | null;  // informative seulement
  cause:       string;         // "bloom" | "sédiment" | "turbidité faible" | "inconnu"
  n_pixels:    number;
  chl_reliable: boolean;
}

interface SatelliteFile {
  fetched_at: string;
  points:     SatellitePoint[];
}

interface SatelliteKd {
  kd: number;
  cause: string;
  kdSource: string;
  confidence: number;
}

/**
 * Lit le fichier satellite et retourne le Kd le plus récent (≤ 3 jours).
 * Retourne null si le fichier est absent, trop ancien, ou sans donnée valide.
 */
function readSatelliteKd(now: Date): SatelliteKd | null {
  try {
    if (!fs.existsSync(SATELLITE_FILE)) return null;

    const raw = fs.readFileSync(SATELLITE_FILE, 'utf-8');
    const data: SatelliteFile = JSON.parse(raw);

    const fetchedAt = new Date(data.fetched_at);
    if (now.getTime() - fetchedAt.getTime() > SATELLITE_MAX_AGE_MS) {
      return null; // fichier trop ancien
    }

    // Point le plus récent avec un Kd valide
    const valid = (data.points ?? [])
      .filter((p) => p.kd != null && p.n_pixels >= 3)
      .sort((a, b) => b.date.localeCompare(a.date));

    if (valid.length === 0) return null;

    const latest = valid[0];
    const ageDays = (now.getTime() - new Date(latest.date + 'T12:00:00Z').getTime())
      / (24 * 3600 * 1000);

    // Confiance : 1.0 si même jour, décroit avec l'âge
    const confidence = Math.max(0.6, 1 - ageDays * 0.12);

    return {
      kd:         latest.kd!,
      cause:      latest.cause,
      kdSource:   latest.kd_source,
      confidence: +confidence.toFixed(2),
    };
  } catch {
    return null; // lecture silencieuse en échec
  }
}


// Contribution 3 — Phytoplancton (climatologie mensuelle)
// Point d'extension satellite : registerSatelliteKdProvider() ci-dessous
// ---------------------------------------------------------------------------

/**
 * Kd_phyto mensuel (m⁻¹) — climatologie Manche orientale.
 * Pic printanier (mars–avril), creux estival (juillet–août).
 * Source : estimation d'après données MODIS/Aqua pour la Manche orientale.
 */
const KD_PHYTO_MONTHLY: number[] = [
  0.04, // jan
  0.05, // fev
  0.10, // mar — bloom printanier
  0.12, // avr — pic
  0.08, // mai
  0.05, // jun
  0.03, // jul — creux estival
  0.03, // aou
  0.04, // sep
  0.05, // oct — bloom automnal léger
  0.05, // nov
  0.04, // dec
];

/** Point d'extension : injecter ici les données satellite (prompt 4) */
export type SatelliteKdProvider = (time: Date) => number | null;
let _satelliteProvider: SatelliteKdProvider | null = null;

export function registerSatelliteKdProvider(fn: SatelliteKdProvider): void {
  _satelliteProvider = fn;
}

function computeKdPhyto(now: Date): number {
  if (_satelliteProvider) {
    const sat = _satelliteProvider(now);
    if (sat != null) return sat;
  }
  return KD_PHYTO_MONTHLY[now.getMonth()];
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

export async function computeClarityTimeseries(
  marineHourly: {
    time: string[];
    wave_height: number[];
    wave_period: number[];
  },
  forecastTimes: string[],
  atmosphere?: {
    shortwave_radiation: number[];
    cloudcover: number[];
    times: string[];
  },
  siteLat = 49.277,
  siteLon = -0.246,
): Promise<ClarityPoint[]> {
  const cacheKey = `clarity_${forecastTimes[0] ?? 'now'}`;
  const cached = clarityCache.get<ClarityPoint[]>(cacheKey);
  if (cached) return cached;

  const now = new Date();

  // Lookup index pour shortwave/cloudcover (alignés sur forecastTimes)
  const atmIndexMap = new Map<string, number>();
  if (atmosphere) {
    atmosphere.times.forEach((t, i) => atmIndexMap.set(t, i));
  }

  function computeLight(t: string, kd: number): LightProfile | undefined {
    if (!atmosphere) return undefined;
    const idx = atmIndexMap.get(t);
    if (idx === undefined) return undefined;
    const sw = atmosphere.shortwave_radiation[idx] ?? 0;
    const cc = (atmosphere.cloudcover[idx] ?? 50) / 100;
    const dt = new Date(t);
    const elev = solarElevation(siteLat, siteLon, dt);
    return computeLightProfile(sw, elev, cc, kd, SITE_DEPTH_M);
  }

  // -------------------------------------------------------------------------
  // Hiérarchie des sources
  // -------------------------------------------------------------------------

  // Priorité 1 : données satellite (fichier produit par le job Copernicus)
  const satellite = readSatelliteKd(now);

  if (satellite) {
    // Le satellite fournit un Kd journalier unique — on l'applique à toute la série
    // en ajoutant la contribution houle horaire par-dessus
    const [orneResult] = await Promise.all([computeKdOrne(marineHourly.time, now)]);

    const result: ClarityPoint[] = forecastTimes.map((t) => {
      const time   = new Date(t);
      const kdWave = computeKdWave(marineHourly, time);

      // Satellite remplace fond + phytoplancton + Orne, mais pas la houle (dynamique)
      const kd = satellite.kd + kdWave;
      const visibilityM = 2.04 / Math.max(kd, 0.01);

      const sources: string[] = [`satellite (${satellite.kdSource})`];
      if (satellite.cause && satellite.cause !== 'inconnu') sources.push(satellite.cause);
      if (kdWave > 0.01) sources.push('remise en suspension');

      return {
        time: t,
        kd:  +kd.toFixed(4),
        visibilityM: +visibilityM.toFixed(1),
        source: sources.join(' + '),
        confidence: +Math.min(1, satellite.confidence * (orneResult.confidence)).toFixed(2),
        light: computeLight(t, kd),
      };
    });

    clarityCache.set(cacheKey, result);
    return result;
  }

  // Priorité 2 : modèle calculé (panache Orne + houle + phytoplancton)
  const [orneResult] = await Promise.all([computeKdOrne(marineHourly.time, now)]);
  const orneAvailable = orneResult.confidence >= 1;

  if (orneAvailable || orneResult.kd > 0) {
    const kdOrne = orneResult.kd;

    const result: ClarityPoint[] = forecastTimes.map((t) => {
      const time    = new Date(t);
      const kdWave  = computeKdWave(marineHourly, time);
      const kdPhyto = computeKdPhyto(time);

      const kd = KD_BACKGROUND + kdOrne + kdWave + kdPhyto;
      const visibilityM = 2.04 / kd;

      const sources: string[] = ['modèle'];
      if (kdOrne > 0.01)  sources.push('panache Orne');
      if (kdWave > 0.01)  sources.push('remise en suspension');
      sources.push('phytoplancton');

      const confidence = orneResult.confidence * 0.85; // modèle < satellite

      return {
        time: t,
        kd:  +kd.toFixed(4),
        visibilityM: +visibilityM.toFixed(1),
        source: sources.join(' + '),
        confidence: +Math.min(1, confidence).toFixed(2),
        light: computeLight(t, kd),
      };
    });

    clarityCache.set(cacheKey, result);
    return result;
  }

  // Priorité 3 : climatologie seule (fallback de dernier recours)
  const result: ClarityPoint[] = forecastTimes.map((t) => {
    const time    = new Date(t);
    const kdPhyto = computeKdPhyto(time);
    const kdWave  = computeKdWave(marineHourly, time);

    const kd = KD_BACKGROUND + kdWave + kdPhyto;
    const visibilityM = 2.04 / kd;

    return {
      time: t,
      kd:  +kd.toFixed(4),
      visibilityM: +visibilityM.toFixed(1),
      source: 'climatologie',
      confidence: 0.30,
      light: computeLight(t, kd),
    };
  });

  clarityCache.set(cacheKey, result);
  return result;
}
