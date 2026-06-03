import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Wind, Waves, AlertTriangle, Search } from 'lucide-react';
import { useUnits } from '../contexts/UnitContext';

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
      swell_wave_period: number[];
      wind_wave_height: number[];
      wind_wave_direction: number[];
      ocean_current_velocity: number[];
      ocean_current_direction: number[];
      sea_surface_temperature: number[];
    };
  };
  daily: { sunrise: string[]; sunset: string[] };
  location: { lat: number; lon: number; name: string };
  isMock?: boolean;
}

// Ouistreham coast faces roughly North (bearing ~0°).
// Waves coming from N = onshore; from S = offshore.
const SITE_BEARING = 0;

function waveExposure(dirFrom: number): { label: string; color: string } {
  const diff = Math.abs(((dirFrom - SITE_BEARING + 180) % 360) - 180);
  if (diff < 60) return { label: 'Face (onshore)', color: '#ef4444' };
  if (diff < 120) return { label: 'Latéral', color: '#f59e0b' };
  return { label: 'Dos (offshore)', color: '#22c55e' };
}

// Wetsuit recommendation based on sea surface temperature
function wetsuitAdvice(sst: number): string {
  if (sst < 8)  return 'Combinaison étanche';
  if (sst < 12) return '7 mm + cagoule + gants';
  if (sst < 16) return '5 mm + cagoule';
  if (sst < 20) return '5 mm';
  if (sst < 24) return '3 mm';
  return '3 mm ou shorty';
}

function weatherDescription(code: number): string {
  if (code === 0) return 'Ciel dégagé';
  if (code <= 3) return 'Peu nuageux';
  if (code <= 9) return 'Brumeux';
  if (code <= 19) return 'Précipitations';
  if (code <= 29) return 'Orage';
  if (code <= 39) return 'Tempête de sable';
  if (code <= 49) return 'Brouillard';
  if (code <= 59) return 'Bruine';
  if (code <= 69) return 'Pluie';
  if (code <= 79) return 'Neige';
  if (code <= 84) return 'Averses';
  if (code <= 94) return 'Grêle';
  if (code <= 99) return 'Orage';
  return 'Inconnu';
}

function weatherEmoji(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 49) return '🌫️';
  if (code <= 69) return '🌧️';
  if (code <= 79) return '❄️';
  if (code <= 84) return '🌦️';
  if (code <= 99) return '⛈️';
  return '🌡️';
}

function windDirectionLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(deg / 45) % 8];
}

const DEFAULT_LOCATION = { lat: 49.2796, lon: -0.2602, name: 'Ouistreham' };

const WeatherWidget: React.FC = () => {
  const { formatWind, formatTemp } = useUnits();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [searching, setSearching] = useState(false);

  const fetchWeather = useCallback(async (lat: number, lon: number, name: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/weather?lat=${lat}&lon=${lon}&name=${encodeURIComponent(name)}`);
      setWeather(res.data);
    } catch {
      setError('Impossible de récupérer les données météo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeather(location.lat, location.lon, location.name);
  }, [location, fetchWeather]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await axios.get(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchQuery)}&count=1&language=fr&format=json`
      );
      if (res.data.results && res.data.results.length > 0) {
        const r = res.data.results[0];
        setLocation({ lat: r.latitude, lon: r.longitude, name: r.name });
        setSearchQuery('');
      } else {
        alert('Lieu non trouvé');
      }
    } catch {
      alert('Erreur de recherche');
    } finally {
      setSearching(false);
    }
  };

  // Get current marine data at closest time
  const getCurrentMarine = () => {
    if (!weather) return null;
    const now = new Date().toISOString().slice(0, 13);
    const idx = weather.marine.hourly.time.findIndex((t) => t.startsWith(now));
    const i = idx >= 0 ? idx : 0;
    const h = weather.marine.hourly;
    return {
      waveHeight: h.wave_height[i] ?? 0,
      waveDirection: h.wave_direction[i] ?? 0,
      wavePeriod: h.wave_period[i] ?? 0,
      swellHeight: h.swell_wave_height[i] ?? 0,
      swellDirection: h.swell_wave_direction[i] ?? 0,
      swellPeriod: h.swell_wave_period[i] ?? 0,
      windWaveHeight: h.wind_wave_height[i] ?? 0,
      windWaveDirection: h.wind_wave_direction[i] ?? 0,
      currentVelocity: h.ocean_current_velocity[i] ?? 0,
      currentDirection: h.ocean_current_direction[i] ?? 0,
      seaTemp: h.sea_surface_temperature[i] ?? 0,
    };
  };

  // Next 24h hourly forecast
  const getNext24h = () => {
    if (!weather) return [];
    const nowStr = new Date().toISOString().slice(0, 13);
    const startIdx = weather.hourly.time.findIndex((t) => t >= nowStr);
    if (startIdx === -1) return [];
    return weather.hourly.time.slice(startIdx, startIdx + 8).map((t, i) => ({
      time: t,
      temp: weather.hourly.temperature_2m[startIdx + i],
      wind: weather.hourly.windspeed_10m[startIdx + i],
      precip: weather.hourly.precipitation[startIdx + i],
      code: weather.hourly.weathercode[startIdx + i],
    }));
  };

  const marine = getCurrentMarine();

  return (
    <div className="card">
      <div className="card-header">
        <Waves size={18} className="text-ocean-400" />
        <span>Météo Marine</span>
        <span className="ml-auto text-sm font-normal text-gray-400">{location.name}</span>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Chercher un lieu..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input flex-1"
        />
        <button type="submit" className="btn-primary" disabled={searching}>
          {searching ? '...' : <Search size={14} />}
        </button>
        {location.name !== DEFAULT_LOCATION.name && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setLocation(DEFAULT_LOCATION)}
          >
            ↩
          </button>
        )}
      </form>

      {loading && (
        <div className="flex items-center justify-center h-32 text-gray-500">
          <div className="animate-pulse">Chargement des données météo...</div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-3 bg-red-900/20 border border-red-700/40 rounded-lg mb-3">
          <span className="text-red-400 text-sm flex-1">{error}</span>
          <button
            className="text-xs px-3 py-1.5 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-900/60 transition-colors"
            onClick={() => fetchWeather(location.lat, location.lon, location.name)}
          >
            Réessayer
          </button>
        </div>
      )}

      {weather?.isMock && !loading && (
        <div className="flex items-start gap-2 mb-4 p-3 bg-amber-900/30 border border-amber-600/50 rounded-lg text-amber-300 text-sm">
          <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Données de démonstration</p>
            <p className="text-amber-400/80 text-xs mt-0.5">L'API météo est temporairement indisponible. Les valeurs affichées sont fictives et ne reflètent pas les conditions réelles.</p>
          </div>
        </div>
      )}

      {weather && !loading && (
        <>
          {/* Current conditions — row 1: air */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-navy-900 rounded-lg p-3 flex items-center gap-3">
              <span className="text-4xl">{weatherEmoji(weather.current.weathercode)}</span>
              <div>
                <p className="text-2xl font-bold text-white">{formatTemp(weather.current.temperature)}</p>
                <p className="text-xs text-gray-400">{weatherDescription(weather.current.weathercode)}</p>
                <p className="text-xs text-gray-500">Précip: {weather.current.precipitation.toFixed(1)} mm/h</p>
              </div>
            </div>
            <div className="bg-navy-900 rounded-lg p-3">
              <div className="flex items-center gap-1 mb-1">
                <Wind size={16} className="text-ocean-400" />
                <span className="text-lg font-bold">{formatWind(weather.current.windspeed)}</span>
                <span className="text-xs text-gray-500 ml-1">rafales {formatWind(weather.current.windgusts)}</span>
              </div>
              <p className="text-xs text-gray-400">
                {windDirectionLabel(weather.current.winddirection)} ({Math.round(weather.current.winddirection)}°)
              </p>
            </div>
          </div>

          {/* Row 2: sea */}
          {marine && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              {/* Swell */}
              <div className="bg-navy-900 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Houle</p>
                <p className="text-lg font-bold text-white">{marine.swellHeight.toFixed(1)} m</p>
                <p className="text-xs text-gray-400">{marine.swellPeriod.toFixed(0)}s · {windDirectionLabel(marine.swellDirection)}</p>
                <p className="text-xs mt-0.5" style={{ color: waveExposure(marine.swellDirection).color }}>
                  {waveExposure(marine.swellDirection).label}
                </p>
              </div>
              {/* Wind sea */}
              <div className="bg-navy-900 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Mer de vent</p>
                <p className="text-lg font-bold text-white">{marine.windWaveHeight.toFixed(1)} m</p>
                <p className="text-xs text-gray-400">{windDirectionLabel(marine.windWaveDirection)}</p>
                <p className="text-xs mt-0.5" style={{ color: waveExposure(marine.windWaveDirection).color }}>
                  {waveExposure(marine.windWaveDirection).label}
                </p>
              </div>
              {/* Current */}
              <div className="bg-navy-900 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Courant</p>
                <p className="text-lg font-bold text-white">{(marine.currentVelocity * 1.944).toFixed(1)} kt</p>
                <p className="text-xs text-gray-400">Dir: {windDirectionLabel(marine.currentDirection)} ({Math.round(marine.currentDirection)}°)</p>
              </div>
              {/* Sea temp + wetsuit */}
              <div className="bg-navy-900 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Mer (surface)</p>
                <p className="text-lg font-bold text-white">{formatTemp(marine.seaTemp)}</p>
                <p className="text-xs text-ocean-400">{wetsuitAdvice(marine.seaTemp)}</p>
              </div>
            </div>
          )}

          {/* 24h forecast */}
          <div>
            <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Prévisions 24h</p>
            <div className="grid grid-cols-4 gap-1.5">
              {getNext24h().map((h, i) => (
                <div key={i} className="bg-navy-900 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500">
                    {new Date(h.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-lg">{weatherEmoji(h.code)}</p>
                  <p className="text-xs font-medium">{formatTemp(h.temp)}</p>
                  <p className="text-xs text-ocean-400">{formatWind(h.wind)}</p>
                  {h.precip > 0 && <p className="text-xs text-blue-400">{h.precip.toFixed(1)}mm</p>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Source footer */}
      {weather && !loading && (
        <p className="text-xs text-gray-700 mt-3 pt-2 border-t border-navy-800">
          Source · Open-Meteo (Forecast + Marine API){weather.isMock ? ' · ⚠️ données fictives' : ` · Mis à jour à ${new Date(weather.current.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
        </p>
      )}
    </div>
  );
};

export default WeatherWidget;
