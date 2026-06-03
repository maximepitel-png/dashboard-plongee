import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Target } from 'lucide-react';
import { useUnits } from '../contexts/UnitContext';
import { useSiteAdjustment, getSiteMultipliers } from '../contexts/SiteAdjustmentContext';

/**
 * CONFIGURATION DU SCORING — modifier ici pour ajuster les seuils
 * Total max : 100 pts (vent 25 + vagues 30 + clarté 20 + temp 10 + courant 15)
 */
const DIVABILITY_CONFIG = {
  wind: {
    maxPts: 25,
    thresholds: [
      { below: 8,  pts: 25 },
      { below: 12, pts: 20 },
      { below: 15, pts: 10 },
      { below: 20, pts: 5  },
    ],
  },
  waves: {
    maxPts: 30,
    thresholds: [
      { below: 0.3, pts: 30 },
      { below: 0.5, pts: 25 },
      { below: 0.8, pts: 18 },
      { below: 1.2, pts: 10 },
      { below: 1.5, pts: 4  },
    ],
  },
  clarity: {
    maxPts: 20,
    thresholds: [
      { below: 0.01, pts: 20 },
      { below: 0.5,  pts: 15 },
      { below: 2,    pts: 8  },
      { below: 5,    pts: 3  },
    ],
  },
  temperature: {
    maxPts: 10,
    thresholds: [
      { below: 999, pts: 10, above: 16 },
      { below: 16,  pts: 8,  above: 12 },
      { below: 12,  pts: 6,  above: 10 },
      { below: 10,  pts: 4,  above: 8  },
    ],
    fallback: 2,
  },
  current: {
    maxPts: 15,
    thresholds: [
      { below: 0.3, pts: 15 },
      { below: 0.6, pts: 12 },
      { below: 1.0, pts: 7  },
      { below: 1.5, pts: 3  },
    ],
  },
};

function scoreFromThresholds(value: number, thresholds: { below: number; pts: number }[]): number {
  for (const t of thresholds) {
    if (value < t.below) return t.pts;
  }
  return 0;
}

interface WeatherData {
  current: {
    temperature: number;
    windspeed: number;
    windgusts: number;
    winddirection: number;
    weathercode: number;
    precipitation: number;
    time: string;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    windspeed_10m: number[];
    windgusts_10m: number[];
    winddirection_10m: number[];
    precipitation: number[];
    weathercode: number[];
  };
  marine: {
    hourly: {
      time: string[];
      wave_height: number[];
      wave_direction: number[];
      wave_period: number[];
      swell_wave_height: number[];
      swell_wave_direction: number[];
      wind_wave_height: number[];
      ocean_current_velocity: number[];
      ocean_current_direction: number[];
      sea_surface_temperature: number[];
    };
  };
  daily: { sunrise: string[]; sunset: string[] };
  location: { lat: number; lon: number; name: string };
}

interface TidalImpact {
  coefficient: number;
  risingTide: boolean;
}

interface DivabilityScore {
  total: number;
  verdict: string;
  verdictColor: string;
  details: { label: string; value: string; score: number; maxPts: number; note?: string }[];
}

function computeDivability(
  windKnots: number,
  waveHeight: number,
  precipitation: number,
  seaTemp: number,
  currentMs: number,
  formatWind: (kt: number) => string = (kt) => `${Math.round(kt)} kt`,
  formatTemp: (c: number) => string = (c) => `${Math.round(c)}°C`,
  multipliers: { wind: number; swell: number; current: number } = { wind: 1, swell: 1, current: 1 },
): DivabilityScore {
  const cfg = DIVABILITY_CONFIG;

  const windScore = scoreFromThresholds(windKnots / multipliers.wind, cfg.wind.thresholds);
  const waveScore = scoreFromThresholds(waveHeight / multipliers.swell, cfg.waves.thresholds);
  const clarityScore = scoreFromThresholds(precipitation, cfg.clarity.thresholds);

  let tempScore = cfg.temperature.fallback;
  if (seaTemp >= 16) tempScore = 10;
  else if (seaTemp >= 12) tempScore = 8;
  else if (seaTemp >= 10) tempScore = 6;
  else if (seaTemp >= 8) tempScore = 4;

  const currentScore = scoreFromThresholds(currentMs / multipliers.current, cfg.current.thresholds);

  const total = windScore + waveScore + clarityScore + tempScore + currentScore;

  let verdict = '';
  let verdictColor = '';
  if (total >= 80) { verdict = 'Excellente'; verdictColor = '#2dd4bf'; }
  else if (total >= 60) { verdict = 'Bonne'; verdictColor = '#2dd4bf'; }
  else if (total >= 40) { verdict = 'Moyenne'; verdictColor = '#f59e0b'; }
  else if (total >= 20) { verdict = 'Déconseillée'; verdictColor = '#ef4444'; }
  else { verdict = 'Annulée'; verdictColor = '#991b1b'; }

  return {
    total,
    verdict,
    verdictColor,
    details: [
      { label: 'Vent', value: formatWind(windKnots), score: windScore, maxPts: cfg.wind.maxPts },
      { label: 'Vagues', value: `${waveHeight.toFixed(1)} m`, score: waveScore, maxPts: cfg.waves.maxPts },
      { label: 'Clarté estimée', value: precipitation < 0.01 ? 'Favorable' : `${precipitation.toFixed(1)} mm/h`, score: clarityScore, maxPts: cfg.clarity.maxPts, note: 'proxy précip. surface — ≠ visibilité sous-marine' },
      { label: 'Temp. mer', value: formatTemp(seaTemp), score: tempScore, maxPts: cfg.temperature.maxPts },
      { label: 'Courant', value: `${(currentMs * 1.944).toFixed(1)} kt`, score: currentScore, maxPts: cfg.current.maxPts },
    ],
  };
}

interface Props {
  selectedDate: string; // "YYYY-MM-DD" ou "" pour aujourd'hui
  marineHorizonDate?: string | null;
}

const DivabilityWidget: React.FC<Props> = ({ selectedDate, marineHorizonDate }) => {
  const { formatWind, formatTemp } = useUnits();
  const { selectedSite } = useSiteAdjustment();
  const multipliers = getSiteMultipliers(selectedSite);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [tidalImpact, setTidalImpact] = useState<TidalImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<DivabilityScore | null>(null);

  const fetchData = useCallback(async (timestamp?: number) => {
    setLoading(true);
    setError(null);
    try {
      const [weatherRes, tideRes] = await Promise.all([
        axios.get('/api/weather'),
        axios.get(`/api/tides/impact${timestamp ? `?timestamp=${timestamp}` : ''}`),
      ]);
      setWeather(weatherRes.data);
      setTidalImpact(tideRes.data);
    } catch {
      setError('Impossible de charger les données de plongeabilité');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // When selectedDate changes from parent, refetch tidal impact
  useEffect(() => {
    if (!weather) return;
    if (selectedDate) {
      const ts = new Date(selectedDate + 'T12:00:00').getTime();
      axios.get(`/api/tides/impact?timestamp=${ts}`)
        .then((res) => setTidalImpact(res.data))
        .catch(() => {});
    }
  }, [selectedDate, weather]);

  useEffect(() => {
    if (!weather || !tidalImpact) return;

    let windKnots: number;
    let waveHeight: number;
    let precipitation: number;
    let seaTemp: number;
    let currentMs: number;

    if (selectedDate) {
      const targetTime = new Date(selectedDate + 'T12:00:00').toISOString().slice(0, 13);
      const hourIdx = weather.hourly.time.findIndex((t) => t >= targetTime);
      const idx = hourIdx >= 0 ? hourIdx : 0;
      windKnots = weather.hourly.windspeed_10m[idx] || 0;
      precipitation = weather.hourly.precipitation[idx] || 0;
      const marineIdx = weather.marine.hourly.time.findIndex((t) => t >= targetTime);
      const mi = marineIdx >= 0 ? marineIdx : 0;
      waveHeight = weather.marine.hourly.wave_height[mi] || 0;
      seaTemp = weather.marine.hourly.sea_surface_temperature[mi] || 12;
      currentMs = weather.marine.hourly.ocean_current_velocity[mi] || 0;
    } else {
      windKnots = weather.current.windspeed;
      precipitation = weather.current.precipitation;
      const now = new Date().toISOString().slice(0, 13);
      const mi = weather.marine.hourly.time.findIndex((t) => t.startsWith(now));
      const i = mi >= 0 ? mi : 0;
      waveHeight = weather.marine.hourly.wave_height[i] || 0;
      seaTemp = weather.marine.hourly.sea_surface_temperature[i] || 12;
      currentMs = weather.marine.hourly.ocean_current_velocity[i] || 0;
    }

    const computed = computeDivability(windKnots, waveHeight, precipitation, seaTemp, currentMs, formatWind, formatTemp, multipliers);
    setScore(computed);
  }, [weather, tidalImpact, selectedDate, multipliers.wind, multipliers.swell, multipliers.current]);

  const beyondMarine = marineHorizonDate
    ? new Date((selectedDate || new Date().toISOString().slice(0, 10)) + 'T12:00:00') > new Date(marineHorizonDate)
    : false;

  const gaugePercentage = score ? score.total : 0;
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (gaugePercentage / 100) * circumference;

  return (
    <div className="card">
      <div className="card-header">
        <Target size={18} className="text-ocean-400" />
        <span>Indice de Plongeabilité</span>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32 text-gray-500 animate-pulse">
          Calcul en cours...
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-3 p-3 bg-red-900/20 border border-red-700/40 rounded-lg mb-3">
          <span className="text-red-400 text-sm flex-1">{error}</span>
          <button
            className="text-xs px-3 py-1.5 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-900/60 transition-colors"
            onClick={() => fetchData()}
          >
            Réessayer
          </button>
        </div>
      )}

      {!loading && !error && !score && !beyondMarine && (
        <div className="text-center py-8 text-gray-500">
          <Target size={32} className="mx-auto mb-2 text-gray-600" />
          <p>Aucune donnée disponible</p>
        </div>
      )}

      {beyondMarine && !loading && (
        <div className="flex flex-col items-center py-4 text-center">
          <p className="text-amber-400 font-medium mb-2">Indice de plongeabilité non disponible</p>
          <p className="text-xs text-gray-500 max-w-xs">
            Les données de houle, courant et température de l'eau ne sont disponibles que sur ~7 jours (horizon API Marine).
            Au-delà, seule la tendance météo (vent, précipitations) est exploitable.
          </p>
          {weather && (() => {
            const targetTime = new Date((selectedDate || new Date().toISOString().slice(0, 10)) + 'T12:00:00').toISOString().slice(0, 13);
            const hourIdx = weather.hourly.time.findIndex((t) => t >= targetTime);
            const idx = hourIdx >= 0 ? hourIdx : 0;
            const wind = weather.hourly.windspeed_10m[idx] || 0;
            const precip = weather.hourly.precipitation[idx] || 0;
            return (
              <div className="mt-4 grid grid-cols-2 gap-3 w-full">
                <div className="bg-navy-900 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Vent prévu</p>
                  <p className="text-lg font-bold text-white">{Math.round(wind)} kt</p>
                  <p className="text-xs text-gray-600">~3–6h résolution</p>
                </div>
                <div className="bg-navy-900 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Précipitations</p>
                  <p className="text-lg font-bold text-white">{precip.toFixed(1)} mm/h</p>
                  <p className="text-xs text-gray-600">Indicatif</p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {!beyondMarine && score && !loading && (
        <div className="flex flex-col items-center">
          {/* Circular gauge */}
          <div className="relative mb-4">
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle
                cx="70" cy="70" r="54"
                fill="none"
                stroke="#0a1628"
                strokeWidth="12"
              />
              <circle
                cx="70" cy="70" r="54"
                fill="none"
                stroke={score.verdictColor}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 70 70)"
                style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
              />
              <text x="70" y="62" textAnchor="middle" className="text-white" fill="white" fontSize="28" fontWeight="bold">
                {score.total}
              </text>
              <text x="70" y="80" textAnchor="middle" fill="#9ca3af" fontSize="11">
                /100
              </text>
            </svg>
          </div>

          {/* Verdict badge */}
          <div
            className="px-6 py-2 rounded-full text-lg font-bold mb-2"
            style={{ backgroundColor: score.verdictColor + '33', color: score.verdictColor, border: `1px solid ${score.verdictColor}55` }}
          >
            {score.verdict}
          </div>
          {selectedSite && (
            <p className="text-xs text-ocean-400/70 mb-3 italic">Ajusté pour {selectedSite.name}</p>
          )}

          {/* Score breakdown */}
          <div className="w-full space-y-2">
            {score.details.map((d) => {
              const pct = (d.score / d.maxPts) * 100;
              const barColor = d.score >= d.maxPts * 0.7 ? '#2dd4bf' : d.score >= d.maxPts * 0.4 ? '#f59e0b' : '#ef4444';
              const qualLabel = d.score >= d.maxPts * 0.7 ? 'Favorable' : d.score >= d.maxPts * 0.4 ? 'Moyen' : 'Défavorable';
              return (
                <div key={d.label}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-24 shrink-0">{d.label}</span>
                    <div className="flex-1 bg-navy-900 rounded-full h-2.5 relative" title={`${d.score}/${d.maxPts} pts — ${qualLabel}`}>
                      <div
                        className="h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: barColor }}
                      />
                    </div>
                    <span className="text-xs text-gray-300 w-16 text-right shrink-0">{d.value}</span>
                    <span className="text-xs w-20 text-right shrink-0" style={{ color: barColor }}>{qualLabel}</span>
                  </div>
                  {d.note && (
                    <p className="text-xs text-amber-500/70 ml-24 mt-0.5 italic">{d.note}</p>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-gray-600 mt-1 italic">Barre courte = facteur défavorable · Barre pleine = facteur optimal</p>
          </div>

          {/* Tidal info */}
          {tidalImpact && (
            <div className="mt-4 flex gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-gray-400">
                <span>{tidalImpact.risingTide ? '📈' : '📉'}</span>
                <span>Marée {tidalImpact.risingTide ? 'montante' : 'descendante'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-400">
                <span>⚓</span>
                <span>Coeff. marée ~{tidalImpact.coefficient}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Source footer */}
      {!beyondMarine && score && !loading && (
        <p className="text-xs text-gray-700 mt-3 pt-2 border-t border-navy-800">
          Source · Open-Meteo + modèle harmonique local · Calcul indicatif, seuils arbitraires · Calculé à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
};

export default DivabilityWidget;
