import React, { createContext, useContext } from 'react';
import type { DiveSite } from '../hooks/useDiveSites';

export interface SiteMultipliers {
  wind: number;
  swell: number;
  current: number;
}

function exposureToMultiplier(level: 'low' | 'medium' | 'high'): number {
  if (level === 'low') return 1.25;
  if (level === 'high') return 0.75;
  return 1.0;
}

export function getSiteMultipliers(site: DiveSite | null): SiteMultipliers {
  if (!site) return { wind: 1, swell: 1, current: 1 };
  return {
    wind: exposureToMultiplier(site.windExposure),
    swell: exposureToMultiplier(site.swellExposure),
    current: exposureToMultiplier(site.currentSensitivity),
  };
}

const SiteAdjustmentContext = createContext<{ selectedSite: DiveSite | null }>({ selectedSite: null });

export const SiteAdjustmentProvider: React.FC<{ selectedSite: DiveSite | null; children: React.ReactNode }> = ({ selectedSite, children }) => (
  <SiteAdjustmentContext.Provider value={{ selectedSite }}>
    {children}
  </SiteAdjustmentContext.Provider>
);

export const useSiteAdjustment = () => useContext(SiteAdjustmentContext);
