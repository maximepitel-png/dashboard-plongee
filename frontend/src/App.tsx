import React from 'react';
import axios from 'axios';
import WeatherWidget from './components/WeatherWidget';
import DivabilityWidget from './components/DivabilityWidget';
import TidesWidget from './components/TidesWidget';
import ClubDivesWidget from './components/ClubDivesWidget';
import EquipmentWidget from './components/EquipmentWidget';
import DiveDecisionBanner from './components/DiveDecisionBanner';
import DiveSitesWidget from './components/DiveSitesWidget';
import { UnitProvider } from './contexts/UnitContext';
import { SiteAdjustmentProvider } from './contexts/SiteAdjustmentContext';
import { useDiveSites } from './hooks/useDiveSites';
import UnitSelector from './components/UnitSelector';
import { computeDayScore } from './utils/diveScore';

interface TideExtreme {
  time: string;
  height: number;
  type: 'high' | 'low';
}

interface TidePoint {
  time: string;
  height: number;
}

export interface DayTides {
  date: string;
  coefficient: number;
  extremes: TideExtreme[];
  points: TidePoint[];
}

const DAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS_FR = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];

function formatDayTab(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
}

function getCoefficientColor(coeff: number): string {
  if (coeff <= 50) return '#22c55e';
  if (coeff <= 70) return '#84cc16';
  if (coeff <= 90) return '#f59e0b';
  if (coeff <= 100) return '#f97316';
  return '#ef4444';
}

function isDayBeyondMarine(date: string, marineHorizonDate: string | null): boolean {
  if (!marineHorizonDate) return false;
  return new Date(date + 'T12:00:00') > new Date(marineHorizonDate);
}

function forecastResolutionLabel(dayIndex: number): string | null {
  if (dayIndex <= 6) return null;
  if (dayIndex <= 9) return '~3h';
  return '~6h';
}

function getDayWindRange(date: string, weather: any): { min: number; max: number } | null {
  if (!weather?.hourly?.time) return null;
  const dayStr = date;
  const indices = weather.hourly.time
    .map((t: string, i: number) => ({ t, i }))
    .filter(({ t }: { t: string }) => t.startsWith(dayStr))
    .map(({ i }: { i: number }) => i);
  if (indices.length === 0) return null;
  const winds = indices.map((i: number) => weather.hourly.windspeed_10m[i]).filter((v: number) => v != null);
  if (winds.length === 0) return null;
  return { min: Math.round(Math.min(...winds)), max: Math.round(Math.max(...winds)) };
}

const DEFAULT_LOCATION = { lat: 49.2796, lon: -0.2602, name: 'Ouistreham' };

const AppInner: React.FC = () => {
  const { selectedSite } = useDiveSites();
  const [currentTime, setCurrentTime] = React.useState(new Date());
  const [tideData, setTideData] = React.useState<DayTides[]>([]);
  const [tidesLoading, setTidesLoading] = React.useState(true);
  const [tidesError, setTidesError] = React.useState<string | null>(null);
  const [selectedDay, setSelectedDay] = React.useState(0);
  const [location, setLocation] = React.useState(DEFAULT_LOCATION);
  const [weather, setWeather] = React.useState<any>(null);
  const [weatherLoading, setWeatherLoading] = React.useState(true);
  const [weatherError, setWeatherError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchTides = React.useCallback(async () => {
    setTidesLoading(true);
    setTidesError(null);
    try {
      const res = await axios.get('/api/tides');
      setTideData(res.data);
    } catch {
      setTidesError('Impossible de charger les données de marées');
    } finally {
      setTidesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchTides();
  }, [fetchTides]);

  const fetchWeather = React.useCallback(async () => {
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const res = await axios.get(
        `/api/weather?lat=${location.lat}&lon=${location.lon}&name=${encodeURIComponent(location.name)}`
      );
      setWeather(res.data);
    } catch {
      setWeatherError('Impossible de récupérer les données météo');
    } finally {
      setWeatherLoading(false);
    }
  }, [location]);

  React.useEffect(() => {
    fetchWeather();
  }, [fetchWeather]);

  const formatDate = (d: Date) =>
    d.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const selectedDate = tideData[selectedDay]?.date ?? '';
  const marineHorizonDate = weather?.marineHorizonDate ?? null;

  return (
    <SiteAdjustmentProvider selectedSite={selectedSite}>
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-navy-700 bg-navy-800/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🤿</span>
            <div>
              <h1 className="text-xl font-bold text-ocean-400 leading-tight">Dashboard Plongée</h1>
              <p className="text-xs text-gray-400">Ouistreham — Calvados</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <UnitSelector />
            <div className="text-right">
              <p className="text-sm text-gray-300 capitalize">{formatDate(currentTime)}</p>
              <p className="text-xs text-gray-500">
                {currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        </div>
        {/* Decorative wave */}
        <div className="h-0.5 bg-gradient-to-r from-transparent via-ocean-400 to-transparent opacity-30" />
      </header>

      {/* Main content */}
      <main className="max-w-screen-2xl mx-auto px-4 py-6">

        {/* Day selector — unique, partagé par tous les widgets */}
        <div className="mb-4">
          {tidesLoading && (
            <div className="flex gap-1.5 flex-wrap">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-10 w-24 rounded-lg bg-navy-800 animate-pulse" />
              ))}
            </div>
          )}
          {tidesError && (
            <div className="flex items-center gap-3 p-3 bg-red-900/20 border border-red-700/40 rounded-lg">
              <span className="text-red-400 text-sm">{tidesError}</span>
              <button
                className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-900/60 transition-colors"
                onClick={fetchTides}
              >
                Réessayer
              </button>
            </div>
          )}
          {!tidesLoading && !tidesError && tideData.length > 0 && (
            <>
              <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                {tideData.map((d, i) => {
                  const beyondMarine = isDayBeyondMarine(d.date, marineHorizonDate);
                  const windRange = weather ? getDayWindRange(d.date, weather) : null;
                  const resLabel = forecastResolutionLabel(i);

                  let dotColor: string | null = null;
                  if (!beyondMarine && weather) {
                    const ds = computeDayScore(d.extremes, weather, i);
                    if (ds.quality === 'excellent') dotColor = '#2dd4bf';
                    else if (ds.quality === 'good') dotColor = '#f59e0b';
                  }

                  return (
                    <button
                      key={d.date}
                      onClick={() => setSelectedDay(i)}
                      style={{ flexShrink: 0 }}
                      className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        selectedDay === i ? 'bg-ocean-500 text-white' : 'bg-navy-800 text-gray-400 hover:bg-navy-700'
                      } ${beyondMarine ? 'opacity-75' : ''}`}
                    >
                      <span className="block">{formatDayTab(d.date)}</span>
                      <span className="block" style={{ color: beyondMarine ? '#6b7280' : getCoefficientColor(d.coefficient) }}>
                        ~C{d.coefficient}
                      </span>
                      {windRange && (
                        <span className="block text-xs text-gray-500 mt-0.5">
                          {windRange.min}–{windRange.max} kt
                        </span>
                      )}
                      {beyondMarine && (
                        <span className="block text-xs text-gray-600 mt-0.5">🌤 météo</span>
                      )}
                      {resLabel && !beyondMarine && (
                        <span className="block text-xs text-gray-600 mt-0.5">~{resLabel}</span>
                      )}
                      {dotColor && (
                        <span
                          className="absolute -top-1 -right-1 w-3 h-3 rounded-full border border-navy-800"
                          style={{ backgroundColor: dotColor }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              {weather && (
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-600 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-teal-400 inline-block" />
                    Excellente fenêtre
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                    Bonne fenêtre
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-700">
                    🌤 Météo seule (au-delà de ~7j)
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Decision banner — meilleur créneau du jour */}
        <DiveDecisionBanner selectedDay={selectedDay} tideData={tideData} weather={weather} marineHorizonDate={marineHorizonDate} />

        {/* Top row: Weather + Divability */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <WeatherWidget
            weather={weather}
            weatherLoading={weatherLoading}
            weatherError={weatherError}
            onRetry={fetchWeather}
            selectedDay={selectedDay}
            location={location}
            onLocationChange={setLocation}
          />
          <DivabilityWidget selectedDate={selectedDate} weather={weather} marineHorizonDate={marineHorizonDate} />
        </div>

        {/* Tides full width */}
        <div className="mb-4">
          <TidesWidget selectedDay={selectedDay} tideData={tideData} tidesLoading={tidesLoading} tidesError={tidesError} onRetry={fetchTides} />
        </div>

        {/* Bottom row: Club + Equipment + DiveSites */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ClubDivesWidget />
          <EquipmentWidget />
          <DiveSitesWidget />
        </div>
      </main>

      <footer className="text-center py-6 text-gray-600 text-xs">
        Dashboard Plongée — Ouistreham, Normandie &nbsp;•&nbsp; Données: Open-Meteo, prédiction harmonique SHOM
      </footer>
    </div>
    </SiteAdjustmentProvider>
  );
};

const App: React.FC = () => (
  <UnitProvider>
    <AppInner />
  </UnitProvider>
);

export default App;
