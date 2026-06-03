import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface WeatherData {
  current: {
    temperature: number;
    windspeed: number;
    winddirection: number;
    weathercode: number;
    precipitation: number;
    time: string;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    windspeed_10m: number[];
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
      sea_surface_temperature: number[];
    };
  };
  location: { lat: number; lon: number; name: string };
}

interface TidalImpact {
  coefficient: number;
  risingTide: boolean;
}

interface DivabilityScore {
  total: number;
  wind: number;
  waves: number;
  visibility: number;
  temperature: number;
  tidal: number;
  verdict: string;
  verdictColor: string;
  details: { label: string; value: string; score: number; note?: string }[];
}

function computeDivability(
  windKnots: number,
  waveHeight: number,
  precipitation: number,
  seaTemp: number,
  tidalCoeff: number
): DivabilityScore {
  // Wind score (0-25 pts): < 8kt = 25, >15kt = 0
  let windScore = 0;
  if (windKnots < 8) windScore = 25;
  else if (windKnots < 12) windScore = 20;
  else if (windKnots < 15) windScore = 10;
  else if (windKnots < 20) windScore = 5;
  else windScore = 0;

  // Wave score (0-30 pts): < 0.5m = 30, >1.5m = 0
  let waveScore = 0;
  if (waveHeight < 0.3) waveScore = 30;
  else if (waveHeight < 0.5) waveScore = 25;
  else if (waveHeight < 0.8) waveScore = 18;
  else if (waveHeight < 1.2) waveScore = 10;
  else if (waveHeight < 1.5) waveScore = 4;
  else waveScore = 0;

  // Visibility score (0-20 pts) based on precipitation
  let visScore = 0;
  if (precipitation === 0) visScore = 20;
  else if (precipitation < 0.5) visScore = 15;
  else if (precipitation < 2) visScore = 8;
  else if (precipitation < 5) visScore = 3;
  else visScore = 0;

  // Temperature score (0-10 pts): < 8°C = penalty
  let tempScore = 0;
  if (seaTemp >= 16) tempScore = 10;
  else if (seaTemp >= 12) tempScore = 8;
  else if (seaTemp >= 10) tempScore = 6;
  else if (seaTemp >= 8) tempScore = 4;
  else tempScore = 2; // cold but doable with drysuit

  // Tidal coefficient score (0-15 pts): low coeff = better diving
  let tidalScore = 0;
  if (tidalCoeff <= 50) tidalScore = 15;
  else if (tidalCoeff <= 70) tidalScore = 12;
  else if (tidalCoeff <= 90) tidalScore = 7;
  else if (tidalCoeff <= 100) tidalScore = 3;
  else tidalScore = 0;

  const total = windScore + waveScore + visScore + tempScore + tidalScore;

  let verdict = '';
  let verdictColor = '';
  if (total >= 80) { verdict = 'Excellente'; verdictColor = '#22c55e'; }
  else if (total >= 60) { verdict = 'Bonne'; verdictColor = '#84cc16'; }
  else if (total >= 40) { verdict = 'Moyenne'; verdictColor = '#f59e0b'; }
  else if (total >= 20) { verdict = 'Déconseillée'; verdictColor = '#ef4444'; }
  else { verdict = 'Annulée'; verdictColor = '#991b1b'; }

  return {
    total,
    wind: windScore,
    waves: waveScore,
    visibility: visScore,
    temperature: tempScore,
    tidal: tidalScore,
    verdict,
    verdictColor,
    details: [
      { label: 'Vent', value: `${Math.round(windKnots)} kt`, score: windScore },
      { label: 'Vagues', value: `${waveHeight.toFixed(1)} m`, score: waveScore },
      { label: 'Précip. surface', value: precipitation === 0 ? 'Aucune' : `${precipitation.toFixed(1)} mm`, score: visScore, note: 'proxy surface — ≠ visibilité sous-marine' },
      { label: 'Temp. mer', value: `${seaTemp.toFixed(1)}°C`, score: tempScore },
      { label: 'Coeff. marée', value: `${tidalCoeff}`, score: tidalScore },
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
    } else {
      windKnots = weather.current.windspeed;
      precipitation = weather.current.precipitation;
      const now = new Date().toISOString().slice(0, 13);
      const mi = weather.marine.hourly.time.findIndex((t) => t.startsWith(now));
      const i = mi >= 0 ? mi : 0;
      waveHeight = weather.marine.hourly.wave_height[i] || 0;
      seaTemp = weather.marine.hourly.sea_surface_temperature[i] || 12;
    }

    const computed = computeDivability(windKnots, waveHeight, precipitation, seaTemp, tidalImpact.coefficient);
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
                        width: `${(d.score / 30) * 100}%`,
                        backgroundColor: d.score >= 20 ? '#22c55e' : d.score >= 10 ? '#f59e0b' : '#ef4444',
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
                <span>Coefficient {tidalImpact.coefficient}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DivabilityWidget;
