import { useState, useEffect } from 'react';

export interface DiveSite {
  id: string;
  name: string;
  maxDepth: number;
  windExposure: 'low' | 'medium' | 'high';
  swellExposure: 'low' | 'medium' | 'high';
  currentSensitivity: 'low' | 'medium' | 'high';
  parking: string;
}

const LS_KEY = 'dive-sites';

const DEFAULT_SITES: DiveSite[] = [
  {
    id: 'ouistreham-ecluse',
    name: 'Écluse d\'Ouistreham',
    maxDepth: 12,
    windExposure: 'medium',
    swellExposure: 'high',
    currentSensitivity: 'high',
    parking: 'Parking gratuit devant l\'écluse',
  },
  {
    id: 'epave-le-pellerin',
    name: 'Épave Le Pellerin',
    maxDepth: 22,
    windExposure: 'high',
    swellExposure: 'high',
    currentSensitivity: 'high',
    parking: 'Mise à l\'eau depuis le port',
  },
];

export function useDiveSites() {
  const [sites, setSites] = useState<DiveSite[]>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_SITES;
    } catch {
      return DEFAULT_SITES;
    }
  });

  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(sites));
  }, [sites]);

  const addSite = (site: Omit<DiveSite, 'id'>) => {
    const newSite: DiveSite = { ...site, id: Date.now().toString() };
    setSites((prev) => [...prev, newSite]);
  };

  const removeSite = (id: string) => {
    setSites((prev) => prev.filter((s) => s.id !== id));
    if (selectedSiteId === id) setSelectedSiteId(null);
  };

  const selectedSite = sites.find((s) => s.id === selectedSiteId) ?? null;

  return { sites, selectedSite, selectedSiteId, setSelectedSiteId, addSite, removeSite };
}
