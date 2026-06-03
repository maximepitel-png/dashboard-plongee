import React from 'react';
import axios from 'axios';
import WeatherWidget from './components/WeatherWidget';
import DivabilityWidget from './components/DivabilityWidget';
import TidesWidget from './components/TidesWidget';
import ClubDivesWidget from './components/ClubDivesWidget';
import EquipmentWidget from './components/EquipmentWidget';
import DiveDecisionBanner from './components/DiveDecisionBanner';
import { UnitProvider } from './contexts/UnitContext';
import UnitSelector from './components/UnitSelector';

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

const App: React.FC = () => {
  const [currentTime, setCurrentTime] = React.useState(new Date());
  const [tideData, setTideData] = React.useState<DayTides[]>([]);
  const [tidesLoading, setTidesLoading] = React.useState(true);
  const [tidesError, setTidesError] = React.useState<string | null>(null);
  const [selectedDay, setSelectedDay] = React.useState(0);

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

  const formatDate = (d: Date) =>
    d.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const selectedDate = tideData[selectedDay]?.date ?? '';

  return (
    <UnitProvider>
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
            <div className="flex gap-1.5 flex-wrap">
              {tideData.map((d, i) => (
                <button
                  key={d.date}
                  onClick={() => setSelectedDay(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedDay === i ? 'bg-ocean-500 text-white' : 'bg-navy-800 text-gray-400 hover:bg-navy-700'
                  }`}
                >
                  <span className="block">{formatDayTab(d.date)}</span>
                  <span className="block" style={{ color: getCoefficientColor(d.coefficient) }}>
                    ~C{d.coefficient}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Decision banner — meilleur créneau du jour */}
        <DiveDecisionBanner selectedDay={selectedDay} tideData={tideData} />

        {/* Top row: Weather + Divability */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <WeatherWidget />
          <DivabilityWidget selectedDate={selectedDate} />
        </div>

        {/* Tides full width */}
        <div className="mb-4">
          <TidesWidget selectedDay={selectedDay} tideData={tideData} tidesLoading={tidesLoading} tidesError={tidesError} onRetry={fetchTides} />
        </div>

        {/* Bottom row: Club + Equipment */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ClubDivesWidget />
          <EquipmentWidget />
        </div>
      </main>

      <footer className="text-center py-6 text-gray-600 text-xs">
        Dashboard Plongée — Ouistreham, Normandie &nbsp;•&nbsp; Données: Open-Meteo, prédiction harmonique SHOM
      </footer>
    </div>
    </UnitProvider>
  );
};

export default App;
