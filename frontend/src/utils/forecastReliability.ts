import { RELIABILITY_TABLE } from '../scoring/model';

export interface ReliabilityInfo {
  pct: number;
  label: string;
  color: string;
}

const RELIABILITY_COLORS = [
  '#2dd4bf', // très fiable
  '#2dd4bf', // fiable
  '#84cc16', // bonne
  '#f59e0b', // modérée
  '#f97316', // faible
  '#ef4444', // très faible
];

export function forecastReliability(dayIndex: number): ReliabilityInfo {
  for (let i = 0; i < RELIABILITY_TABLE.length; i++) {
    if (dayIndex <= RELIABILITY_TABLE[i].maxDays) {
      return {
        pct: Math.round(RELIABILITY_TABLE[i].reliability * 100),
        label: RELIABILITY_TABLE[i].label,
        color: RELIABILITY_COLORS[i] ?? '#ef4444',
      };
    }
  }
  const last = RELIABILITY_TABLE[RELIABILITY_TABLE.length - 1];
  return {
    pct: Math.round(last.reliability * 100),
    label: last.label,
    color: RELIABILITY_COLORS[RELIABILITY_TABLE.length - 1] ?? '#ef4444',
  };
}
