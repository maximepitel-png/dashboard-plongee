import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

/**
 * CONFIGURATION DU SCORING — modifier ici pour ajuster les seuils
 * Total max : 100 pts (vent 25 + vagues 30 + clarté 20 + temp 10 + courant 15)
 */
const DIVABILITY_CONFIG = {
  wind: {
    maxPts: 25,
    // [seuil_kt, pts] — au-delà du dernier seuil : 0 pt
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
    // Proxy précipitation surface (mm/h)
    thresholds: [
      { below: 0.01, pts: 20 },
      { below: 0.5,  pts: 15 },
      { below: 2,    pts: 8  },
      { below: 5,    pts: 3  },
    ],
  },
  temperature: {
    maxPts: 10,
    // SST en °C
    thresholds: [
      { below: 999, pts: 10, above: 16 },
      { below: 16,  pts: 8,  above: 12 },
      { below: 12,  pts: 6,  above: 10 },
      { below: 10,  pts: 4,  above: 8  },
    ],
    fallback: 2, // < 8°C combinaison étanche
  },
  current: {
    maxPts: 15,
    // Courant en m/s (ocean_current_velocity)
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
  currentMs: number,  // ocean current in m/s
): DivabilityScore {
  const cfg = DIVABILITY_CONFIG;

  const windScore = scoreFromThresholds(windKnots, cfg.wind.thresholds);
  const waveScore = scoreFromThresholds(waveHeight, cfg.waves.thresholds);

  // Clarté estimée : proxy précip surface. Pénalise la pluie (ruissellement, sédiments Orne).
  const clarityScore = scoreFromThresholds(precipitation, cfg.clarity.thresholds);

  // Température : SST surface (≠ profondeur sous thermocline)
  let tempScore = cfg.temperature.fallback;
  if (seaTemp >= 16) tempScore = 10;
  else if (seaTemp >= 12) tempScore = 8;
  else if (seaTemp >= 10) tempScore = 6;
  else if (seaTemp >= 8) tempScore = 4;

  // Courant en m/s → remplace le coefficient de marée dans l'indice
  const currentScore = scoreFromThresholds(currentMs, cfg.current.thresholds);

  const total = windScore + waveScore + clarityScore + tempScore + currentScore;

  let verdict = '';
  let verdictColor = '';
  if (total >= 80) { verdict = 'Excellente'; verdictColor = '#22c55e'; }
  else if (total >= 60) { verdict = 'Bonne'; verdictColor = '#84cc16'; }
  else if (total >= 40) { verdict = 'Moyenne'; verdictColor = '#f59e0b'; }
  else if (total >= 20) { verdict = 'Déconseillée'; verdictColor = '#ef4444'; }
  else { verdict = 'Annulée'; verdictColor = '#991b1b'; }

  return {
    total,
    verdict,
    verdictColor,
    details: [
      { label: 'Vent', value: `${Math.round(windKnots)} kt`, score: windScore, maxPts: cfg.wind.maxPts },
      { label: 'Vagues', value: `${waveHeight.toFixed(1)} m`, score: waveScore, maxPts: cfg.waves.maxPts },
      { label: 'Clarté estimée', value: precipitation < 0.01 ? 'Favorable' : `${precipitation.toFixed(1)} mm/h`, score: clarityScore, maxPts: cfg.clarity.maxPts, note: 'proxy précip. surface — ≠ visibilité sous-marine' },
      { label: 'Temp. mer', value: `${seaTemp.toFixed(1)}°C`, score: tempScore, maxPts: cfg.temperature.maxPts },
      { label: 'Courant', value: `${(currentMs * 1.944).toFixed(1)} kt`, score: currentScore, maxPts: cfg.current.maxPts },
    ],
  };
}

const DivabilityWidget: React.FC = () => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [tidalImpact, setTidalImpact] = useState<TidalImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');
  const [score, setScore] = useState<DivabilityScore | null>(null);

  const fetchData = useCallback(async (timestamp?: number) => {
    setLoading(true);
    try {
      const [weatherRes, tideRes] = await Promise.all([
        axios.get('/api/weather'),
        axios.get(`/api/tides/impact${timestamp ? `?timestamp=${timestamp}` : ''}`),
      ]);
      setWeather(weatherRes.data);
      setTidalImpact(tideRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

    const computed = computeDivability(windKnots, waveHeight, precipitation, seaTemp, currentMs);
    setScore(computed);
  }, [weather, tidalImpact, selectedDate]);

  const handleDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value;
    setSelectedDate(d);
    if (d) {
      const ts = new Date(d + 'T12:00:00').getTime();
      try {
        const tideRes = await axios.get(`/api/tides/impact?timestamp=${ts}`);
        setTidalImpact(tideRes.data);
      } catch {}
    } else {
      fetchData();
    }
  };

  // Calculate min date (today) and max date (7 days)
  const today = new Date().toISOString().split('T')[0];
  const maxDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const gaugePercentage = score ? score.total : 0;
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (gaugePercentage / 100) * circumference;

  return (
    <div className="card">
      <div className="card-header">
        <span>🎯</span>
        <span>Indice de Plongeabilité</span>
      </div>

      {/* Date selector */}
      <div className="flex items-center gap-3 mb-5">
        <label className="text-sm text-gray-400">Date de plongée:</label>
        <input
          type="date"
          className="input"
          value={selectedDate}
          min={today}
          max={maxDate}
          onChange={handleDateChange}
        />
        {selectedDate && (
          <button className="btn-ghost text-xs" onClick={() => { setSelectedDate(''); fetchData(); }}>
            Aujourd'hui
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32 text-gray-500 animate-pulse">
          Calcul en cours...
        </div>
      )}

      {score && !loading && (
        <div className="flex flex-col items-center">
          {/* Circular gauge */}
          <div className="relative mb-4">
            <svg width="140" height="140" viewBox="0 0 140 140">
              {/* Background circle */}
              <circle
                cx="70" cy="70" r="54"
                fill="none"
                stroke="#0a1628"
                strokeWidth="12"
              />
              {/* Progress arc */}
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
              {/* Score text */}
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
            className="px-6 py-2 rounded-full text-lg font-bold mb-5"
            style={{ backgroundColor: score.verdictColor + '33', color: score.verdictColor, border: `1px solid ${score.verdictColor}55` }}
          >
            {score.verdict}
          </div>

          {/* Score breakdown */}
          <div className="w-full space-y-2">
            {score.details.map((d) => (
              <div key={d.label}>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-24 shrink-0">{d.label}</span>
                  <div className="flex-1 bg-navy-900 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${(d.score / d.maxPts) * 100}%`,
                        backgroundColor: d.score >= d.maxPts * 0.7 ? '#22c55e' : d.score >= d.maxPts * 0.4 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-300 w-16 text-right shrink-0">{d.value}</span>
                </div>
                {d.note && (
                  <p className="text-xs text-amber-500/70 ml-24 mt-0.5 italic">{d.note}</p>
                )}
              </div>
            ))}
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
      {score && !loading && (
        <p className="text-xs text-gray-700 mt-3 pt-2 border-t border-navy-800">
          Source · Open-Meteo + modèle harmonique local · Calcul indicatif, seuils arbitraires · Calculé à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
};

export default DivabilityWidget;
