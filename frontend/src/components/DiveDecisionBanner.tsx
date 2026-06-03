import React, { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * ALGORITHME DE DÉCISION — Meilleure fenêtre de plongée du jour
 *
 * Principe : on plonge de préférence à l'ÉTALE, c'est-à-dire le moment de renverse
 * du courant autour de chaque PM (pleine mer) ou BM (basse mer). En Manche, le courant
 * de flot/jusant peut atteindre 2-3 nœuds ; à l'étale il est quasi nul pendant ~30-90 min.
 *
 * Pour chaque étale du jour (fenêtre ±45 min autour de chaque PM/BM) :
 *   1. On récupère vent et vagues depuis les données horaires Open-Meteo
 *   2. On vérifie que la fenêtre est entre lever et coucher du soleil
 *   3. On calcule un score :
 *        score = windScore(vent_kt) + waveScore(vagues_m) + bonus_diurne
 *        windScore : 25 pts si < 8 kt, dégressif jusqu'à 0 au-delà de 20 kt
 *        waveScore : 30 pts si < 0.3 m, dégressif jusqu'à 0 au-delà de 1.5 m
 *        bonus_diurne : +10 pts si fenêtre entièrement de jour
 *   4. On retient l'étale avec le meilleur score comme "meilleure fenêtre"
 *
 * AVERTISSEMENT : ceci est une aide indicative basée sur des modèles météo et
 * une prédiction harmonique des marées. Ne jamais utiliser comme seule autorisation
 * de mise à l'eau. Consulter MétéoFrance et les tables SHOM officielles.
 */

interface TideExtreme {
  time: string;
  height: number;
  type: 'high' | 'low';
}

interface DayTides {
  date: string;
  coefficient: number;
  extremes: TideExtreme[];
}

interface WeatherData {
  hourly: {
    time: string[];
    windspeed_10m: number[];
    precipitation: number[];
  };
  marine: {
    hourly: {
      time: string[];
      wave_height: number[];
    };
  };
  daily: {
    sunrise: string[];
    sunset: string[];
  };
  isMock?: boolean;
}

interface EtaleWindow {
  extremeType: 'high' | 'low';
  extremeTime: Date;
  extremeHeight: number;
  windowStart: Date;
  windowEnd: Date;
  wind: number;
  waves: number;
  isDaylight: boolean;
  score: number;
}

function getHourlyValue(times: string[], values: number[], target: Date): number {
  const targetHour = target.toISOString().slice(0, 13);
  const idx = times.findIndex((t) => t.slice(0, 13) >= targetHour);
  return idx >= 0 ? (values[idx] ?? 0) : 0;
}

function computeWindScore(kt: number): number {
  if (kt < 8) return 25;
  if (kt < 12) return 20;
  if (kt < 15) return 10;
  if (kt < 20) return 5;
  return 0;
}

function computeWaveScore(m: number): number {
  if (m < 0.3) return 30;
  if (m < 0.5) return 25;
  if (m < 0.8) return 18;
  if (m < 1.2) return 10;
  if (m < 1.5) return 4;
  return 0;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
}

function computeEtaleWindows(
  extremes: TideExtreme[],
  weather: WeatherData,
  dayIndex: number
): EtaleWindow[] {
  const sunrise = new Date(weather.daily.sunrise[dayIndex] ?? weather.daily.sunrise[0]);
  const sunset = new Date(weather.daily.sunset[dayIndex] ?? weather.daily.sunset[0]);
  const ETALE_MARGIN_MS = 45 * 60 * 1000;

  return extremes.map((ext) => {
    const t = new Date(ext.time);
    const windowStart = new Date(t.getTime() - ETALE_MARGIN_MS);
    const windowEnd = new Date(t.getTime() + ETALE_MARGIN_MS);

    const wind = getHourlyValue(weather.hourly.time, weather.hourly.windspeed_10m, t);
    const waves = getHourlyValue(weather.marine.hourly.time, weather.marine.hourly.wave_height, t);
    const isDaylight = windowStart >= sunrise && windowEnd <= sunset;

    const score = computeWindScore(wind) + computeWaveScore(waves) + (isDaylight ? 10 : 0);

    return {
      extremeType: ext.type,
      extremeTime: t,
      extremeHeight: ext.height,
      windowStart,
      windowEnd,
      wind,
      waves,
      isDaylight,
      score,
    };
  });
}

function qualityLabel(score: number): { label: string; color: string; bg: string } {
  if (score >= 55) return { label: 'Excellente', color: '#22c55e', bg: 'bg-green-900/30 border-green-600/40' };
  if (score >= 40) return { label: 'Bonne', color: '#84cc16', bg: 'bg-lime-900/30 border-lime-600/40' };
  if (score >= 25) return { label: 'Moyenne', color: '#f59e0b', bg: 'bg-amber-900/30 border-amber-600/40' };
  return { label: 'Difficile', color: '#ef4444', bg: 'bg-red-900/30 border-red-600/40' };
}

const DiveDecisionBanner: React.FC = () => {
  const [tideData, setTideData] = useState<DayTides[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const [tidesRes, weatherRes] = await Promise.all([
          axios.get('/api/tides'),
          axios.get('/api/weather'),
        ]);
        setTideData(tidesRes.data);
        setWeather(weatherRes.data);
      } catch {
        // silent — widgets below show individual errors
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading || !weather || tideData.length === 0) return null;

  const day = tideData[selectedDay];
  const windows = computeEtaleWindows(day.extremes, weather, selectedDay);
  const best = windows.length > 0 ? windows.reduce((a, b) => (b.score > a.score ? b : a)) : null;

  const DAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const MONTHS_FR = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
  const formatDay = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
  };

  const quality = best ? qualityLabel(best.score) : null;

  return (
    <div className="mb-4">
      {/* Day selector tabs */}
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {tideData.map((d, i) => (
          <button
            key={d.date}
            onClick={() => setSelectedDay(i)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedDay === i ? 'bg-ocean-500 text-white' : 'bg-navy-800 text-gray-400 hover:bg-navy-700'
            }`}
          >
            {formatDay(d.date)}
          </button>
        ))}
      </div>

      {/* Decision card */}
      <div className={`rounded-xl border p-4 ${quality?.bg ?? 'bg-navy-800 border-navy-600'}`}>
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">

          {/* Best window */}
          {best ? (
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Meilleur créneau du jour</span>
                {!best.isDaylight && <span className="text-xs text-amber-500">⚠️ hors jour</span>}
              </div>
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-2xl font-bold text-white">
                  {formatTime(best.windowStart)} – {formatTime(best.windowEnd)}
                </span>
                <span
                  className="text-sm font-semibold px-2 py-0.5 rounded-full"
                  style={{ color: quality?.color, backgroundColor: quality?.color + '22' }}
                >
                  {quality?.label}
                </span>
              </div>
              <p className="text-sm text-gray-300">
                Étale de {best.extremeType === 'high' ? 'pleine mer' : 'basse mer'} à {formatTime(best.extremeTime)}
                {' '}({best.extremeHeight.toFixed(2)} m)
                {' · '}Vent {Math.round(best.wind)} kt
                {' · '}Vagues {best.waves.toFixed(1)} m
              </p>
            </div>
          ) : (
            <div className="flex-1">
              <p className="text-gray-400 text-sm">Aucune étale disponible pour ce jour.</p>
            </div>
          )}

          {/* All étale windows */}
          <div className="flex flex-wrap gap-2 lg:flex-col lg:min-w-[200px]">
            {windows.map((w, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-xs border ${
                  best === w
                    ? 'border-ocean-400/50 bg-ocean-900/30'
                    : 'border-navy-600 bg-navy-900/50'
                }`}
              >
                <p className="font-semibold text-gray-200">
                  Étale {w.extremeType === 'high' ? 'PM' : 'BM'} · {formatTime(w.extremeTime)}
                </p>
                <p className="text-gray-400 mt-0.5">
                  {formatTime(w.windowStart)}–{formatTime(w.windowEnd)}
                </p>
                <p className="text-gray-500 mt-0.5">
                  {Math.round(w.wind)} kt · {w.waves.toFixed(1)} m
                  {!w.isDaylight && ' · 🌙'}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-gray-600 mt-3 pt-2 border-t border-white/5">
          ⚠️ Aide indicative uniquement — jamais une autorisation de mise à l'eau. Consulter MétéoFrance et les tables SHOM avant toute plongée.
          {weather.isMock && <span className="text-amber-600/70"> · Données fictives (API indisponible)</span>}
        </p>
      </div>
    </div>
  );
};

export default DiveDecisionBanner;
