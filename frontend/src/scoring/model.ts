/**
 * model.ts — Source de vérité unique du modèle de plongeabilité
 *
 * Ce fichier est le SEUL endroit du dépôt où sont définies :
 *   - les pondérations et bornes des facteurs
 *   - les paliers de verdict
 *   - la table de fiabilité par horizon
 *   - les multiplicateurs d'exposition de site
 *   - la liste des sources de données
 *
 * Chaque entrée porte une explication en français simple,
 * destinée à être affichée dans la page Méthode.
 */

// ---------------------------------------------------------------------------
// Facteurs
// ---------------------------------------------------------------------------

export interface FactorThreshold {
  /** Valeur en dessous de laquelle ce palier s'applique */
  below: number;
  /** Points attribués */
  pts: number;
}

export interface Factor {
  /** Clé programmatique */
  key: string;
  /** Libellé affiché */
  label: string;
  /** Points maximum */
  maxPts: number;
  /** Paliers de scoring (du meilleur au moins bon) */
  thresholds: FactorThreshold[];
  /** Unité de la valeur brute (affichage) */
  unit: string;
  /** Explication pour un néophyte */
  description: string;
  /** Valeur considérée comme « favorable » (bonne condition) */
  favorableBelow: number;
  /** Valeur considérée comme rédhibitoire (plongée annulée sur ce seul facteur) */
  adverseAbove: number;
}

export const FACTORS: Record<string, Factor> = {
  wind: {
    key: 'wind',
    label: 'Vent',
    maxPts: 25,
    unit: 'kt',
    thresholds: [
      { below: 8,  pts: 25 },
      { below: 12, pts: 20 },
      { below: 15, pts: 10 },
      { below: 20, pts: 5  },
      { below: Infinity, pts: 0 },
    ],
    favorableBelow: 8,
    adverseAbove: 20,
    description:
      "Le vent crée des vagues de surface et complique l'entrée à l'eau. " +
      "En dessous de 8 nœuds (≈15 km/h), la surface est calme ; " +
      "au-delà de 20 nœuds la plongée est généralement annulée.",
  },
  waves: {
    key: 'waves',
    label: 'Vagues',
    maxPts: 30,
    unit: 'm',
    thresholds: [
      { below: 0.3, pts: 30 },
      { below: 0.5, pts: 25 },
      { below: 0.8, pts: 18 },
      { below: 1.2, pts: 10 },
      { below: 1.5, pts: 4  },
      { below: Infinity, pts: 0 },
    ],
    favorableBelow: 0.3,
    adverseAbove: 1.5,
    description:
      "La hauteur des vagues détermine le confort et la sécurité de la mise à l'eau. " +
      "Moins de 30 cm, c'est idéal ; au-delà de 1,5 m il devient dangereux " +
      "d'embarquer ou de débarquer depuis un zodiac ou une côte rocheuse.",
  },
  clarity: {
    key: 'clarity',
    label: 'Clarté',
    maxPts: 20,
    unit: 'm',
    thresholds: [
      // Paliers visibilité (m) — utilisés quand la donnée satellite/modèle est disponible
      // et que la préférence « la visibilité compte dans ma note » est activée.
      // Plus la valeur est haute, mieux c'est (logique inversée gérée dans scoring.ts).
      { below: 0.01, pts: 20 }, // inutilisé dans ce mode — conservé pour le mode précip.
      { below: 0.5,  pts: 15 },
      { below: 2,    pts: 8  },
      { below: 5,    pts: 3  },
      { below: Infinity, pts: 0 },
    ],
    favorableBelow: 0.01,
    adverseAbove: 5,
    description:
      "La visibilité sous-marine dépend de la turbidité de l'eau : " +
      "panache de l'Orne, remise en suspension par la houle et phytoplancton. " +
      "En Manche orientale, la visibilité typique varie de 1 m (forte turbidité) " +
      "à 8 m (eaux claires). Le proxy par précipitations est utilisé quand la " +
      "donnée satellite ou le modèle Orne ne sont pas disponibles.",
  },
  current: {
    key: 'current',
    label: 'Courant',
    maxPts: 15,
    unit: 'm/s',
    thresholds: [
      { below: 0.3, pts: 15 },
      { below: 0.6, pts: 12 },
      { below: 1.0, pts: 7  },
      { below: 1.5, pts: 3  },
      { below: Infinity, pts: 0 },
    ],
    favorableBelow: 0.3,
    adverseAbove: 1.5,
    description:
      "Le courant de marée en Manche peut atteindre 2 à 3 nœuds (1–1,5 m/s) " +
      "et épuise rapidement un plongeur. L'étale (renverse du courant autour " +
      "d'une PM ou BM) offre une fenêtre de 30 à 90 minutes où le courant " +
      "est quasi nul — c'est le moment idéal pour plonger.",
  },
  temperature: {
    key: 'temperature',
    label: 'Temp. mer',
    maxPts: 10,
    unit: '°C',
    thresholds: [
      // Attention : la température utilise une logique "above" inversée.
      // Le scoring est géré manuellement dans computeDivability.
      { below: Infinity, pts: 0 },
    ],
    favorableBelow: 999,  // non utilisé (logique inversée)
    adverseAbove: 8,
    description:
      "La température de l'eau conditionne la protection thermique nécessaire. " +
      "En Manche, l'eau varie de 8°C en hiver à 18°C en été. " +
      "En dessous de 8°C une combinaison étanche est indispensable ; " +
      "au-dessus de 16°C une 5 mm suffit pour la plupart des plongeurs.",
  },
} as const;

/**
 * Paliers de visibilité (m) pour le scoring de clarté quand la donnée réelle est disponible.
 * Logique inversée : plus la visibilité est haute, plus le score est élevé.
 * Usage : scoreVisibilityM(vm) dans scoring.ts
 */
export const VISIBILITY_THRESHOLDS: { above: number; pts: number }[] = [
  { above: 5.0, pts: 20 },  // excellente — eau claire
  { above: 3.0, pts: 15 },  // bonne
  { above: 2.0, pts: 8  },  // moyenne
  { above: 1.5, pts: 3  },  // mauvaise
  { above: 0,   pts: 0  },  // très mauvaise (<1,5 m)
];

/** Seuil d'alerte binômage (m) — en dessous, la visibilité est insuffisante */
export const VISIBILITY_BINOME_ALERT_M = 2.5;

/** Score maximum en mode complet (tous facteurs) */
export const MAX_SCORE_FULL: number = Object.values(FACTORS).reduce((s, f) => s + f.maxPts, 0);

/** Score maximum en mode partiel (vent + clarté uniquement, horizon marin dépassé) */
export const MAX_SCORE_PARTIAL: number = FACTORS.wind.maxPts + FACTORS.clarity.maxPts;

// ---------------------------------------------------------------------------
// Paliers de verdict
// ---------------------------------------------------------------------------

export interface VerdictLevel {
  /** Libellé affiché */
  label: 'Excellente' | 'Bonne' | 'Moyenne' | 'Déconseillée' | 'Annulée';
  /** Pourcentage minimum du score max pour atteindre ce niveau (0-1) */
  minPct: number;
  color: string;
  bg: string;
  /** Explication pour un néophyte */
  description: string;
}

export const VERDICT_LEVELS: VerdictLevel[] = [
  {
    label: 'Excellente',
    minPct: 0.8,
    color: '#2dd4bf',
    bg: 'bg-teal-900/30 border-teal-600/40',
    description: "Toutes les conditions sont réunies. C'est le moment idéal pour plonger.",
  },
  {
    label: 'Bonne',
    minPct: 0.6,
    color: '#2dd4bf',
    bg: 'bg-teal-900/30 border-teal-600/40',
    description: "Les conditions sont favorables avec quelques réserves mineures.",
  },
  {
    label: 'Moyenne',
    minPct: 0.4,
    color: '#f59e0b',
    bg: 'bg-amber-900/30 border-amber-600/40',
    description: "La plongée est possible mais inconfortable. Réservé aux plongeurs expérimentés.",
  },
  {
    label: 'Déconseillée',
    minPct: 0.2,
    color: '#ef4444',
    bg: 'bg-red-900/30 border-red-600/40',
    description: "Les conditions sont défavorables. La plongée est fortement déconseillée.",
  },
  {
    label: 'Annulée',
    minPct: 0,
    color: '#991b1b',
    bg: 'bg-red-900/30 border-red-600/40',
    description: "Conditions dangereuses. La plongée doit être annulée.",
  },
] as const;

// ---------------------------------------------------------------------------
// Fiabilité par horizon
// ---------------------------------------------------------------------------

export interface ReliabilityLevel {
  /** Horizon max en jours */
  maxDays: number;
  label: string;
  /** 0-1 */
  reliability: number;
  description: string;
}

export const RELIABILITY_TABLE: ReliabilityLevel[] = [
  {
    maxDays: 1,
    label: 'Très fiable',
    reliability: 0.95,
    description:
      "À J et J+1, les modèles météo sont très fiables. " +
      "Erreur typique sur le vent inférieure à 5 %.",
  },
  {
    maxDays: 3,
    label: 'Fiable',
    reliability: 0.85,
    description:
      "À 2-3 jours, les prévisions sont fiables pour planifier une sortie. " +
      "Les valeurs de houle peuvent varier de ±15 %.",
  },
  {
    maxDays: 5,
    label: 'Bonne',
    reliability: 0.70,
    description:
      "À 4-5 jours, les tendances générales sont correctes mais " +
      "les valeurs précises peuvent varier de ±30 %. Utile pour planifier " +
      "la semaine sans réserver définitivement.",
  },
  {
    maxDays: 7,
    label: 'Modérée',
    reliability: 0.55,
    description:
      "À 6-7 jours, le modèle marin atteint ses limites. " +
      "Les prévisions de houle et courant sont des ordres de grandeur.",
  },
  {
    maxDays: 10,
    label: 'Faible',
    reliability: 0.35,
    description:
      "Au-delà de 7 jours, les données marines (houle, courant, température) " +
      "ne sont plus disponibles. Seuls le vent et la clarté estimée sont pris en compte " +
      "(score sur 45 pts au lieu de 100).",
  },
  {
    maxDays: Infinity,
    label: 'Très faible',
    reliability: 0.20,
    description:
      "Au-delà de 10 jours, les prévisions sont très incertaines. " +
      "À utiliser uniquement comme tendance générale.",
  },
] as const;

// ---------------------------------------------------------------------------
// Multiplicateurs d'exposition de site
// ---------------------------------------------------------------------------

export interface SiteExposure {
  key: string;
  label: string;
  /** mult > 1 → site abrité (valeur effective réduite → meilleur score) */
  /** mult < 1 → site exposé (valeur effective augmentée → score dégradé) */
  multipliers: { wind: number; swell: number; current: number };
  description: string;
}

export const SITE_EXPOSURES: SiteExposure[] = [
  {
    key: 'default',
    label: 'Standard',
    multipliers: { wind: 1, swell: 1, current: 1 },
    description: "Site en mer ouverte, sans protection particulière contre le vent ou la houle.",
  },
  {
    key: 'sheltered',
    label: 'Abrité',
    multipliers: { wind: 1.4, swell: 1.5, current: 1.2 },
    description:
      "Site protégé par une presqu'île, une falaise ou une infrastructure portuaire. " +
      "Le vent et la houle y sont sensiblement atténués.",
  },
  {
    key: 'exposed',
    label: 'Exposé',
    multipliers: { wind: 0.8, swell: 0.75, current: 0.9 },
    description:
      "Site exposé aux vents dominants et à la houle de secteur. " +
      "Les conditions réelles y sont souvent plus difficiles que les prévisions au large.",
  },
] as const;

// ---------------------------------------------------------------------------
// Sources de données
// ---------------------------------------------------------------------------

export interface DataSource {
  key: string;
  label: string;
  url: string;
  /** Variables fournies par cette source */
  provides: string[];
  /** Explication pour un néophyte */
  description: string;
  /** Limite connue */
  knownLimit: string;
}

export const DATA_SOURCES: DataSource[] = [
  {
    key: 'open-meteo-atm',
    label: 'Open-Meteo (atmosphérique)',
    url: 'https://open-meteo.com',
    provides: ['vent', 'précipitations', 'température air', 'code météo'],
    description:
      "Modèle météorologique atmosphérique open-source basé sur les données GFS et ECMWF. " +
      "Fournit les prévisions de vent et précipitations à 16 jours.",
    knownLimit:
      "Résolution spatiale de ~10 km — peut sous-estimer les effets locaux " +
      "(chenaux, caps, baies). Mise à jour toutes les heures.",
  },
  {
    key: 'open-meteo-marine',
    label: 'Open-Meteo (marin)',
    url: 'https://marine-api.open-meteo.com',
    provides: ['hauteur des vagues', 'courant océanique', 'température de surface'],
    description:
      "Extension marine d'Open-Meteo basée sur le modèle ERA5/GFS Wave. " +
      "Fournit la houle, le courant et la température de surface de la mer.",
    knownLimit:
      "Horizon limité à ~7 jours. Au-delà, les données de houle et courant " +
      "ne sont plus disponibles — le score bascule automatiquement en mode partiel.",
  },
  {
    key: 'api-maree-fr',
    label: 'api-maree.fr (Ifremer/PREVIMER)',
    url: 'https://api-maree.fr',
    provides: ['hauteur de marée', 'PM/BM', 'coefficient estimé'],
    description:
      "Données de marée issues des composantes harmoniques Ifremer/PREVIMER. " +
      "Fournit les hauteurs d'eau toutes les 15 minutes sur 15 jours, " +
      "à partir desquelles sont calculés les PM/BM et les fenêtres d'étale.",
    knownLimit:
      "Le coefficient de marée officiel (SHOM) n'est pas fourni — " +
      "il est estimé à partir du marnage, calibré sur Ouistreham. " +
      "Consultez maree.shom.fr pour les valeurs officielles.",
  },
  {
    key: 'open-meteo-geocoding',
    label: 'Open-Meteo (géocodage)',
    url: 'https://geocoding-api.open-meteo.com',
    provides: ['coordonnées GPS', 'nom de ville'],
    description:
      "API de recherche de lieux par nom, appelée directement depuis le navigateur. " +
      "Permet de chercher n'importe quelle ville pour centrer les prévisions dessus.",
    knownLimit:
      "Couverture mondiale mais résolution variable selon les pays. " +
      "Certains hameaux ou sites de plongée locaux peuvent ne pas être trouvés.",
  },
] as const;
