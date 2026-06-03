export interface ReliabilityInfo {
  pct: number;       // 0–100
  label: string;
  color: string;
}

export function forecastReliability(dayIndex: number): ReliabilityInfo {
  if (dayIndex <= 1) return { pct: 95, label: 'Très fiable', color: '#2dd4bf' };
  if (dayIndex <= 3) return { pct: 85, label: 'Fiable', color: '#2dd4bf' };
  if (dayIndex <= 5) return { pct: 70, label: 'Bonne', color: '#84cc16' };
  if (dayIndex <= 7) return { pct: 55, label: 'Modérée', color: '#f59e0b' };
  if (dayIndex <= 10) return { pct: 35, label: 'Faible', color: '#f97316' };
  return { pct: 20, label: 'Très faible', color: '#ef4444' };
}
