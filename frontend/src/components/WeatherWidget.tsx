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
    return {
      waveHeight: weather.marine.hourly.wave_height[i] ?? 0,
      waveDirection: weather.marine.hourly.wave_direction[i] ?? 0,
      wavePeriod: weather.marine.hourly.wave_period[i] ?? 0,
      seaTemp: weather.marine.hourly.sea_surface_temperature[i] ?? 0,
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
        <span>🌊</span>
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
          {searching ? '...' : '🔍'}
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
        <div className="text-red-400 text-sm p-3 bg-red-900/20 rounded-lg">{error}</div>
      )}

      {weather && !loading && (
        <>
          {/* Current conditions */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-navy-900 rounded-lg p-3 flex items-center gap-3">
              <span className="text-4xl">{weatherEmoji(weather.current.weathercode)}</span>
              <div>
                <p className="text-2xl font-bold text-white">{Math.round(weather.current.temperature)}°C</p>
                <p className="text-xs text-gray-400">{weatherDescription(weather.current.weathercode)}</p>
              </div>
            </div>
            <div className="bg-navy-900 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-ocean-400">💨</span>
                <span className="text-lg font-bold">{Math.round(weather.current.windspeed)} kt</span>
              </div>
              <p className="text-xs text-gray-400">
                Direction: {windDirectionLabel(weather.current.winddirection)} ({Math.round(weather.current.winddirection)}°)
              </p>
              <p className="text-xs text-gray-400">
                Précip: {weather.current.precipitation.toFixed(1)} mm
              </p>
            </div>
            {marine && (
              <>
                <div className="bg-navy-900 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-ocean-400">🌊</span>
                    <span className="text-lg font-bold">{marine.waveHeight.toFixed(1)} m</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Hauteur des vagues
                  </p>
                  <p className="text-xs text-gray-400">
                    Période: {marine.wavePeriod.toFixed(0)}s
                  </p>
                </div>
                <div className="bg-navy-900 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-ocean-400">🌡️</span>
                    <span className="text-lg font-bold">{marine.seaTemp.toFixed(1)}°C</span>
                  </div>
                  <p className="text-xs text-gray-400">Température mer</p>
                  <p className="text-xs text-gray-400">
                    Dir. vagues: {windDirectionLabel(marine.waveDirection)}
                  </p>
                </div>
              </>
            )}
          </div>

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
                  <p className="text-xs font-medium">{Math.round(h.temp)}°</p>
                  <p className="text-xs text-ocean-400">{Math.round(h.wind)} kt</p>
                  {h.precip > 0 && <p className="text-xs text-blue-400">{h.precip.toFixed(1)}mm</p>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WeatherWidget;
