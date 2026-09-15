/**
 * lightModel.ts — Modèle de lumière disponible sous l'eau
 *
 * Chaîne de calcul :
 *   1. Élévation solaire (astronomie, formule Iqbal 1983)
 *   2. Transmission de surface (Fresnel, mélange direct/diffus)
 *   3. Beer-Lambert : E(z) = E₀ · T · exp(−kd·z)
 *
 * Paliers d'affichage à la profondeur du site :
 *   ≥ 500 lux  → lisible sans lampe       ('readable')
 *   ≥  50 lux  → couleurs éteintes         ('colors_gone')
 *   ≥   5 lux  → lampe nécessaire          ('lamp_needed')
 *   <   5 lux  → noir                       ('black')
 *
 * Conversion rayonnement solaire → lux : 116 lux / (W·m⁻²)
 * (approximation PAR visible, valable pour le calcul de pénétration lumineuse)
 *
 * Indice de réfraction eau de mer à 490 nm : 1.341
 * Transmission diffuse isotrope (overcast) : 0.934 (Morel & Antoine 1994)
 */

const LUX_PER_WM2  = 116.0;
const N_WATER      = 1.341;   // indice eau de mer à 490 nm
const T_DIFFUSE    = 0.934;   // transmission pour lumière diffuse isotrope

const LUX_BLACK       = 5;
const LUX_LAMP_NEEDED = 50;
const LUX_READABLE    = 500;

// ---------------------------------------------------------------------------
// Types exportés
// ---------------------------------------------------------------------------

export interface LightProfile {
  /** Éclairement à la profondeur du site (lux) */
  irradianceAtDepthLux: number;
  /** Profondeur où E < 5 lux — noir absolu (m) */
  darkDepthM: number;
  /** Profondeur où E < 50 lux — couleurs disparaissent (m) */
  colorLostDepthM: number;
  /** Palier d'éclairage à la profondeur du site */
  tier: 'readable' | 'colors_gone' | 'lamp_needed' | 'black';
  /** Élévation solaire (degrés) — pour diagnostic */
  solarElevationDeg: number;
  /** Éclairement juste sous la surface (lux) */
  surfaceIrradianceLux: number;
  /** Visibilité estimée : 2.04 / kd (m) */
  visibilityM: number;
}

// ---------------------------------------------------------------------------
// Élévation solaire
// ---------------------------------------------------------------------------

/**
 * Élévation solaire en degrés pour un lieu et un instant UTC.
 * Algorithme : Iqbal (1983), précision ±0.01° — suffisante pour ce calcul.
 *
 * @param latDeg  Latitude (degrés, nord positif)
 * @param lonDeg  Longitude (degrés, est positif)
 * @param dt      Instant UTC
 */
export function solarElevation(latDeg: number, lonDeg: number, dt: Date): number {
  const lat = latDeg * Math.PI / 180;

  // Jour julien
  const JD = dt.getTime() / 86_400_000 + 2_440_587.5;
  const n  = JD - 2_451_545.0;

  // Longitude écliptique du Soleil
  const L_deg = ((280.460 + 0.985_647_4 * n) % 360 + 360) % 360;
  const g     = ((357.528 + 0.985_600_3 * n) % 360 + 360) % 360 * Math.PI / 180;
  const lambda_deg = L_deg + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g);
  const lambda = lambda_deg * Math.PI / 180;

  // Obliquité écliptique
  const eps = (23.439 - 0.000_000_4 * n) * Math.PI / 180;

  // Déclinaison
  const sin_dec = Math.sin(eps) * Math.sin(lambda);
  const dec     = Math.asin(Math.max(-1, Math.min(1, sin_dec)));

  // Ascension droite
  const RA_deg = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) * 180 / Math.PI;

  // Équation du temps (heures)
  const EqT = (L_deg - RA_deg) / 15;

  // Angle horaire
  const utcH   = dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600;
  const noon   = 12 - lonDeg / 15 - EqT;
  const H      = ((utcH - noon) * 15) * Math.PI / 180;

  // Élévation
  const sin_e = Math.sin(lat) * Math.sin(dec)
              + Math.cos(lat) * Math.cos(dec) * Math.cos(H);

  return Math.asin(Math.max(-1, Math.min(1, sin_e))) * 180 / Math.PI;
}

// ---------------------------------------------------------------------------
// Transmission de surface (Fresnel)
// ---------------------------------------------------------------------------

/**
 * Coefficient de transmission à la surface air-eau.
 *
 * @param elevationDeg  Élévation solaire (degrés)
 * @param cloudCover    Fraction nuageuse [0-1]
 *
 * Pour la lumière directe, la réflexion de Fresnel devient importante quand
 * l'élévation passe sous 25° (angle rasant). Au-dessous de 0°, le soleil
 * est sous l'horizon et la transmission est nulle.
 *
 * La couverture nuageuse pondère entre transmission directe (Fresnel) et
 * diffuse (T_DIFFUSE = 0.934). Le rayonnement Open-Meteo étant déjà
 * corrigé des nuages, ce mélange ne sert qu'à calculer la perte Fresnel
 * (moins sévère pour la lumière diffuse).
 */
export function surfaceTransmission(elevationDeg: number, cloudCover: number): number {
  if (elevationDeg <= 0) return 0;

  // Angle d'incidence (depuis la normale à la surface)
  const theta_i = (90 - elevationDeg) * Math.PI / 180;
  const sin_t   = Math.sin(theta_i) / N_WATER;

  if (sin_t >= 1) return cloudCover * T_DIFFUSE; // ne devrait pas arriver

  const theta_t = Math.asin(sin_t);
  const sum_i_t = theta_i + theta_t;
  const dif_i_t = theta_i - theta_t;

  // Cas limite : incidence normale (theta_i ≈ 0) — pas de réflexion Fresnel
  const Rs = Math.abs(dif_i_t) < 1e-10 ? 0
    : (Math.sin(dif_i_t) / Math.sin(sum_i_t)) ** 2;
  const Rp = Math.abs(dif_i_t) < 1e-10 ? 0
    : (Math.tan(dif_i_t) / Math.tan(sum_i_t)) ** 2;

  const R         = (Rs + Rp) / 2;
  const T_direct  = Math.max(0, 1 - R);

  return cloudCover * T_DIFFUSE + (1 - cloudCover) * T_direct;
}

// ---------------------------------------------------------------------------
// Profil de lumière Beer-Lambert
// ---------------------------------------------------------------------------

/**
 * Calcule le profil de lumière sous-marine.
 *
 * @param shortwaveWm2  Rayonnement solaire de surface (W/m²) — déjà corrigé des nuages
 * @param elevationDeg  Élévation solaire (degrés)
 * @param cloudCover    Fraction nuageuse [0-1], pour le calcul Fresnel uniquement
 * @param kd            Coefficient d'atténuation diffuse (m⁻¹)
 * @param siteDepthM    Profondeur du site (m)
 */
export function computeLightProfile(
  shortwaveWm2: number,
  elevationDeg: number,
  cloudCover: number,
  kd: number,
  siteDepthM: number,
): LightProfile {
  const E0_lux = Math.max(0, shortwaveWm2) * LUX_PER_WM2;
  const T      = surfaceTransmission(elevationDeg, cloudCover);
  const E0_sub = E0_lux * T; // sous la surface

  // E(z) = E0_sub · exp(−kd·z)
  const irradianceAtDepthLux = E0_sub > 0 && kd > 0
    ? E0_sub * Math.exp(-kd * siteDepthM)
    : 0;

  // Profondeur seuil : z* = −ln(threshold / E0_sub) / kd
  const thresholdDepth = (lux: number): number => {
    if (E0_sub <= lux || kd <= 0) return 0;
    return -Math.log(lux / E0_sub) / kd;
  };

  const darkDepthM      = thresholdDepth(LUX_BLACK);
  const colorLostDepthM = thresholdDepth(LUX_LAMP_NEEDED);

  let tier: LightProfile['tier'];
  if (irradianceAtDepthLux >= LUX_READABLE)    tier = 'readable';
  else if (irradianceAtDepthLux >= LUX_LAMP_NEEDED) tier = 'colors_gone';
  else if (irradianceAtDepthLux >= LUX_BLACK)   tier = 'lamp_needed';
  else                                            tier = 'black';

  const visibilityM = kd > 0 ? 2.04 / kd : 99;

  return {
    irradianceAtDepthLux: +irradianceAtDepthLux.toFixed(1),
    darkDepthM:            +darkDepthM.toFixed(1),
    colorLostDepthM:       +colorLostDepthM.toFixed(1),
    tier,
    solarElevationDeg:     +elevationDeg.toFixed(1),
    surfaceIrradianceLux:  +E0_sub.toFixed(0),
    visibilityM:           +visibilityM.toFixed(1),
  };
}

/**
 * Trouve la première heure dans la journée où le tier passe à 'black'
 * et n'en sort plus (en soirée). Retourne null si jamais noir toute la journée.
 */
export function findLampRequiredHour(
  hourlyTimes: string[],
  profiles: LightProfile[],
): string | null {
  // On cherche la dernière heure où ce n'est PAS noir (dans l'après-midi/soir)
  // puis on retourne l'heure suivante
  let lastNotBlack = -1;
  for (let i = profiles.length - 1; i >= 0; i--) {
    if (profiles[i].tier !== 'black') {
      lastNotBlack = i;
      break;
    }
  }
  if (lastNotBlack < 0 || lastNotBlack === profiles.length - 1) return null;
  return hourlyTimes[lastNotBlack + 1] ?? null;
}
