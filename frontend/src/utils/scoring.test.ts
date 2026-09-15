import { describe, it, expect } from 'vitest';
import { computeDivability } from './scoring';

const perfect: Parameters<typeof computeDivability>[0] = {
  windKnots: 5,
  waveHeight: 0.2,
  precipitation: 0,
  seaTemp: 18,
  currentMs: 0.1,
};

const poor: Parameters<typeof computeDivability>[0] = {
  windKnots: 25,
  waveHeight: 2.0,
  precipitation: 10,
  seaTemp: 6,
  currentMs: 2.0,
};

describe('computeDivability — mode complet', () => {
  it('conditions parfaites => score max 100 et verdict Excellente', () => {
    const r = computeDivability(perfect);
    expect(r.score).toBe(100);
    expect(r.maxPossible).toBe(100);
    expect(r.verdict).toBe('Excellente');
    expect(r.isPartial).toBe(false);
  });

  it('conditions mauvaises => score faible et verdict Annulee', () => {
    const r = computeDivability(poor);
    expect(r.score).toBeLessThan(20);
    expect(r.verdict).toBe('Annulée');
  });

  it('somme des details == score total', () => {
    const r = computeDivability(perfect);
    const sum = r.details.reduce((acc, d) => acc + d.score, 0);
    expect(sum).toBe(r.score);
  });

  it('seuil Moyenne : pct entre 0.4 et 0.6', () => {
    const r = computeDivability({ windKnots: 14, waveHeight: 1.0, precipitation: 1, seaTemp: 11, currentMs: 0.8 });
    expect(r.score / r.maxPossible).toBeGreaterThanOrEqual(0.4);
    expect(r.score / r.maxPossible).toBeLessThan(0.6);
    expect(r.verdict).toBe('Moyenne');
  });
});

describe('computeDivability — mode partiel', () => {
  it('max est 45 et seuls 2 facteurs', () => {
    const r = computeDivability(perfect, { isPartial: true });
    expect(r.maxPossible).toBe(45);
    expect(r.isPartial).toBe(true);
    expect(r.details).toHaveLength(2);
  });

  it('score partiel <= 45', () => {
    const r = computeDivability(perfect, { isPartial: true });
    expect(r.score).toBeLessThanOrEqual(45);
  });
});

describe('computeDivability — exposition du site', () => {
  it('site abrite (mult > 1) => meilleur score', () => {
    const base = computeDivability({ ...perfect, windKnots: 13 });
    const abrite = computeDivability({ ...perfect, windKnots: 13 }, { multipliers: { wind: 1.5, swell: 1, current: 1 } });
    expect(abrite.score).toBeGreaterThanOrEqual(base.score);
  });

  it('site expose (mult < 1) => score degrade', () => {
    const base = computeDivability({ ...perfect, windKnots: 7 });
    const expose = computeDivability({ ...perfect, windKnots: 7 }, { multipliers: { wind: 0.5, swell: 1, current: 1 } });
    expect(expose.score).toBeLessThanOrEqual(base.score);
  });
});

describe('midi != etale', () => {
  it('scores differents quand les conditions varient', () => {
    const midiConditions = { windKnots: 5, waveHeight: 0.2, precipitation: 0, seaTemp: 18, currentMs: 0.1 };
    const etaleConditions = { windKnots: 18, waveHeight: 1.3, precipitation: 0, seaTemp: 18, currentMs: 1.2 };
    const midi = computeDivability(midiConditions);
    const etale = computeDivability(etaleConditions);
    expect(midi.score).not.toBe(etale.score);
  });

  it('scores identiques quand les conditions sont uniformes', () => {
    const r1 = computeDivability(perfect);
    const r2 = computeDivability(perfect);
    expect(r1.score).toBe(r2.score);
  });
});

describe('coherence jauge <-> banniere', () => {
  it('memes conditions => meme verdict', () => {
    const jaugeResult = computeDivability(perfect);
    const banniereResult = computeDivability(perfect, { daylightBonus: 10, currentBonus: 0 });
    expect(jaugeResult.verdict).toBe(banniereResult.verdict);
    expect(jaugeResult.verdictColor).toBe(banniereResult.verdictColor);
  });

  it('rankingScore inclut les bonus mais verdict reste sur score de base', () => {
    const r = computeDivability({ windKnots: 14, waveHeight: 0.4, precipitation: 0, seaTemp: 14, currentMs: 0.5 }, { daylightBonus: 10, currentBonus: 5 });
    expect(r.rankingScore).toBe(r.score + 15);
    const rNoBonus = computeDivability({ windKnots: 14, waveHeight: 0.4, precipitation: 0, seaTemp: 14, currentMs: 0.5 });
    expect(r.verdict).toBe(rNoBonus.verdict);
  });
});
