import React from 'react';
import WeatherWidget from './components/WeatherWidget';
import DivabilityWidget from './components/DivabilityWidget';
import TidesWidget from './components/TidesWidget';
import ClubDivesWidget from './components/ClubDivesWidget';
import EquipmentWidget from './components/EquipmentWidget';

const App: React.FC = () => {
  const [currentTime, setCurrentTime] = React.useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (d: Date) =>
    d.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
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
          <div className="text-right">
            <p className="text-sm text-gray-300 capitalize">{formatDate(currentTime)}</p>
            <p className="text-xs text-gray-500">
              {currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
        {/* Decorative wave */}
        <div className="h-0.5 bg-gradient-to-r from-transparent via-ocean-400 to-transparent opacity-30" />
      </header>

      {/* Main content */}
      <main className="max-w-screen-2xl mx-auto px-4 py-6">
        {/* Top row: Weather + Divability */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <WeatherWidget />
          <DivabilityWidget />
        </div>

        {/* Tides full width */}
        <div className="mb-4">
          <TidesWidget />
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
  );
};

export default App;
