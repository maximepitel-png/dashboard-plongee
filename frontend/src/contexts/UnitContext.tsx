import React, { createContext, useContext, useState } from 'react';

type WindUnit = 'kt' | 'kmh';
type TempUnit = 'c' | 'f';

interface UnitContextValue {
  windUnit: WindUnit;
  tempUnit: TempUnit;
  setWindUnit: (u: WindUnit) => void;
  setTempUnit: (u: TempUnit) => void;
  formatWind: (kt: number) => string;
  formatTemp: (c: number) => string;
}

const UnitContext = createContext<UnitContextValue>({
  windUnit: 'kt',
  tempUnit: 'c',
  setWindUnit: () => {},
  setTempUnit: () => {},
  formatWind: (kt) => `${Math.round(kt)} kt`,
  formatTemp: (c) => `${Math.round(c)}°C`,
});

export const UnitProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [windUnit, setWindUnit] = useState<WindUnit>('kt');
  const [tempUnit, setTempUnit] = useState<TempUnit>('c');

  const formatWind = (kt: number): string => {
    if (windUnit === 'kmh') return `${Math.round(kt * 1.852)} km/h`;
    return `${Math.round(kt)} kt`;
  };

  const formatTemp = (c: number): string => {
    if (tempUnit === 'f') return `${Math.round(c * 9/5 + 32)}°F`;
    return `${Math.round(c)}°C`;
  };

  return (
    <UnitContext.Provider value={{ windUnit, tempUnit, setWindUnit, setTempUnit, formatWind, formatTemp }}>
      {children}
    </UnitContext.Provider>
  );
};

export const useUnits = () => useContext(UnitContext);
