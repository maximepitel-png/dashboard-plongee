import React from 'react';
import { useUnits } from '../contexts/UnitContext';

const UnitSelector: React.FC = () => {
  const { windUnit, tempUnit, setWindUnit, setTempUnit } = useUnits();

  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-600 mr-1">Vent</span>
        <div className="flex items-center gap-1 bg-navy-800 rounded-lg p-1">
          <button
            onClick={() => setWindUnit('kt')}
            title="Nœuds"
            className={`px-2 py-1 rounded transition-colors ${windUnit === 'kt' ? 'bg-ocean-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            kt
          </button>
          <button
            onClick={() => setWindUnit('kmh')}
            className={`px-2 py-1 rounded transition-colors ${windUnit === 'kmh' ? 'bg-ocean-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            km/h
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-600 mr-1">Temp.</span>
        <div className="flex items-center gap-1 bg-navy-800 rounded-lg p-1">
          <button
            onClick={() => setTempUnit('c')}
            className={`px-2 py-1 rounded transition-colors ${tempUnit === 'c' ? 'bg-ocean-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            °C
          </button>
          <button
            onClick={() => setTempUnit('f')}
            className={`px-2 py-1 rounded transition-colors ${tempUnit === 'f' ? 'bg-ocean-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            °F
          </button>
        </div>
      </div>
    </div>
  );
};

export default UnitSelector;
