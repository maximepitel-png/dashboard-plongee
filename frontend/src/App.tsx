import React from 'react';
import axios from 'axios';
import HourlyDetailView from './components/HourlyDetailView';
import DivabilityWidget from './components/DivabilityWidget';
import TidesWidget from './components/TidesWidget';
import ClubDivesWidget from './components/ClubDivesWidget';
import EquipmentWidget from './components/EquipmentWidget';
import DiveDecisionBanner from './components/DiveDecisionBanner';
import DiveSitesWidget from './components/DiveSitesWidget';
import { UnitProvider, useUnits } from './contexts/UnitContext';
import { SiteAdjustmentProvider } from './contexts/SiteAdjustmentContext';
import { useDiveSites } from './hooks/useDiveSites';
import UnitSelector from './components/UnitSelector';
import { computeDayDivabilityScore } from './utils/divabilityPerDay';
import { forecastReliability } from './utils/forecastReliability';

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
  isApproximate?: boolean;
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
  const { formatWind, formatTemp } = useUnits();
  const [currentTime, setCurrentTime] = React.useState(new Date());
  const [tideData, setTideData] = React.useState<DayTides[]>([]);
  const [tidesLoading, setTidesLoading] = React.useState(true);
  const [tidesError, setTidesError] = React.useState<string | null>(null);
  const [selectedDay, setSelectedDay] = React.useState(0);
  const [location, setLocation] = React.useState(DEFAULT_LOCATION);
  const [weather, setWeather] = React.useState<any>(null);
  const [weatherLoading, setWeatherLoading] = React.useState(true);
  const [weatherError, setWeatherError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searching, setSearching] = React.useState(false);

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

  const handleLocationSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await axios.get(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchQuery)}&count=5&language=fr&format=json`
      );
      if (res.data.results && res.data.results.length > 0) {
        const r = res.data.results[0];
        setLocation({ lat: r.latitude, lon: r.longitude, name: r.name });
        setSearchQuery('');
      }
    } catch {
      // silent fail
    } finally {
      setSearching(false);
    }
  };

  const formatDate = (d: Date) =>
    d.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const selectedDate = tideData[selectedDay]?.date ?? '';
  const dayTides = tideData[selectedDay] ?? null;
  const marineHorizonDate = weather?.marineHorizonDate ?? null;

  return (
    <SiteAdjustmentProvider selectedSite={selectedSite}>
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-navy-700 bg-navy-800/50 backdrop-blur-sm sticky top-0 z-10">
        {/* Row 1: branding + location + search + units + clock */}
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-2xl">🤿</span>
            <span className="text-sm font-bold text-gray-400 hidden sm:block">Dashboard Plongée</span>
          </div>

          {/* Location display + search */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00b4d8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              <h1 className="text-lg font-bold text-ocean-400 leading-tight truncate">{location.name}</h1>
              {weatherLoading && <span className="text-xs text-gray-600 animate-pulse">chargement…</span>}
            </div>
            <form onSubmit={handleLocationSearch} className="flex gap-1.5">
              <input
                type="text"
                placeholder="Changer de lieu…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input flex-1 text-xs py-1 h-7 min-w-0"
              />
              <button type="submit" disabled={searching} className="btn-primary text-xs px-2 py-1 h-7 shrink-0">
                {searching ? '…' : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                )}
              </button>
              {location.name !== DEFAULT_LOCATION.name && (
                <button
                  type="button"
                  className="btn-ghost text-xs px-2 py-1 h-7 shrink-0"
                  onClick={() => { setLocation(DEFAULT_LOCATION); setSearchQuery(''); }}
                  title="Retour à Ouistreham"
                >
                  ↩
                </button>
              )}
            </form>
          </div>

          {/* Units + clock */}
          <div className="flex items-center gap-3 shrink-0">
            <UnitSelector />
            <div className="text-right hidden md:block">
              <p className="text-xs text-gray-400 capitalize">{formatDate(currentTime)}</p>
              <p className="text-xs text-gray-600">
                {currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        </div>

        {/* Decorative line */}
        <div className="h-0.5 bg-gradient-to-r from-transparent via-ocean-400 to-transparent opacity-30" />

        {/* Row 2: Rich day bar */}
        <div className="max-w-screen-2xl mx-auto px-4 py-2">
          {tidesLoading && (
            <div className="flex gap-2">
              {[0,1,2,3,4,5,6].map(i => (
                <div key={i} className="h-20 w-28 rounded-lg bg-navy-900 animate-pulse shrink-0" />
              ))}
            </div>
          )}
          {!tidesLoading && !tidesError && tideData.length > 0 && (
            <>
              <div
                className="flex gap-2 overflow-x-auto pb-1"
                style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' } as React.CSSProperties}
              >
                {tideData.map((d, i) => {
                  const beyondMarine = isDayBeyondMarine(d.date, marineHorizonDate);
                  const windRange = weather ? getDayWindRange(d.date, weather) : null;
                  const isSelected = selectedDay === i;

                  // Per-day divability score
                  const dayScore = weather ? computeDayDivabilityScore(d.date, weather, marineHorizonDate) : null;

                  // Air temp at noon
                  const noonStr = d.date + 'T12';
                  const noonIdx = weather?.hourly?.time?.findIndex((t: string) => t >= noonStr) ?? -1;
                  const airTemp = noonIdx >= 0 ? Math.round(weather?.hourly?.temperature_2m?.[noonIdx] ?? 0) : null;

                  const isToday = i === 0;

                  return (
                    <button
                      key={d.date}
                      onClick={() => setSelectedDay(i)}
                      style={{ flexShrink: 0, minWidth: '108px' }}
                      title={`Fiabilité prévision : ${forecastReliability(i).label} (${forecastReliability(i).pct}%)`}
                      className={`relative rounded-xl px-3 py-2 text-left transition-all duration-150 ${
                        isSelected
                          ? 'bg-ocean-600/40 border border-ocean-400/60 shadow-lg shadow-ocean-900/30'
                          : 'bg-navy-900/80 border border-navy-700/60 hover:border-navy-500'
                      } ${beyondMarine ? 'opacity-70' : ''}`}
                    >
                      {/* Date */}
                      <p className={`text-xs font-semibold mb-1 ${isSelected ? 'text-ocean-300' : 'text-gray-400'}`}>
                        {isToday ? "Aujourd'hui" : formatDayTab(d.date)}
                      </p>

                      {/* Divability score */}
                      {dayScore ? (
                        <>
                          <div className="flex items-baseline gap-1 mb-1">
                            <span className="text-lg font-bold leading-none" style={{ color: dayScore.verdictColor }}>
                              {dayScore.score}
                            </span>
                            <span className="text-xs text-gray-600">/{dayScore.maxPossible}</span>
                          </div>
                          <p className="text-xs font-medium mb-1.5" style={{ color: dayScore.verdictColor }}>
                            {dayScore.verdict}{dayScore.isPartial ? '*' : ''}
                          </p>
                          {/* Mini score bar */}
                          <div className="h-1 rounded-full bg-navy-700 mb-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${(dayScore.score / dayScore.maxPossible) * 100}%`,
                                backgroundColor: dayScore.verdictColor,
                              }}
                            />
                          </div>
                        </>
                      ) : (
                        <div className="h-8 mb-1.5" />
                      )}

                      {/* Wind range */}
                      {windRange && (() => {
                        const unit = formatWind(0).includes('km') ? 'km/h' : 'kt';
                        const conv = unit === 'km/h' ? (v: number) => Math.round(v * 1.852) : (v: number) => v;
                        return (
                          <p className="text-xs text-gray-500">
                            {conv(windRange.min)}–{conv(windRange.max)} {unit}
                          </p>
                        );
                      })()}

                      {/* Reliability bar */}
                      {(() => {
                        const rel = forecastReliability(i);
                        return (
                          <div className="flex items-center gap-1 mt-1">
                            <div className="flex-1 h-0.5 rounded-full bg-navy-700 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${rel.pct}%`, backgroundColor: rel.color }} />
                            </div>
                            <span className="text-xs shrink-0" style={{ color: rel.color }}>{rel.pct}%</span>
                          </div>
                        );
                      })()}

                      {/* Air temp + coefficient */}
                      <div className="flex items-center justify-between mt-0.5">
                        {airTemp !== null && (
                          <span className="text-xs text-gray-500">{formatTemp(airTemp)}</span>
                        )}
                        <span className="text-xs ml-auto" style={{ color: beyondMarine ? '#4b5563' : getCoefficientColor(d.coefficient) }}>
                          {d.isApproximate ? '~' : ''}C{d.coefficient}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-700 flex-wrap">
                <span>Score /100 (indice de plongeabilité à midi)</span>
                {tideData.some((d) => isDayBeyondMarine(d.date, marineHorizonDate)) && (
                  <span className="text-gray-700">* score partiel /45 (au-delà de ~7j, météo seule)</span>
                )}
                {tideData.some((d) => d.isApproximate) && (
                  <span className="text-amber-700/70">~C coefficient approximatif — vérifier sur maree.info</span>
                )}
              </div>
            </>
          )}
          {tidesError && (
            <div className="flex items-center gap-3 p-2 bg-red-900/20 border border-red-700/40 rounded-lg">
              <span className="text-red-400 text-xs flex-1">{tidesError}</span>
              <button className="text-xs px-2 py-1 rounded bg-red-900/40 text-red-300" onClick={fetchTides}>Réessayer</button>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-screen-2xl mx-auto px-4 py-6">

        {/* Row 1: Banner + Divability side by side, compact */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
          <div className="lg:col-span-2">
            <DiveDecisionBanner selectedDay={selectedDay} tideData={tideData} weather={weather} marineHorizonDate={marineHorizonDate} />
          </div>
          <div className="lg:col-span-3">
            <DivabilityWidget selectedDate={selectedDate} weather={weather} marineHorizonDate={marineHorizonDate} />
          </div>
        </div>

        {/* Row 2: HourlyDetailView full width */}
        <div className="mb-4">
          <HourlyDetailView
            weather={weather}
            weatherLoading={weatherLoading}
            weatherError={weatherError}
            onRetry={fetchWeather}
            selectedDay={selectedDay}
            location={location}
            dayTides={dayTides}
            marineHorizonDate={marineHorizonDate}
          />
        </div>

        {/* Row 3: Tides full width */}
        <div className="mb-4">
          <TidesWidget selectedDay={selectedDay} tideData={tideData} tidesLoading={tidesLoading} tidesError={tidesError} onRetry={fetchTides} weather={weather} />
        </div>

        {/* Row 4: Club + Equipment + DiveSites */}
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
