import { describe, it, expect } from 'vitest';
import {
  solarElevation,
  surfaceTransmission,
  computeLightProfile,
  findLampRequiredHour,
} from './lightModel';

// ---------------------------------------------------------------------------
// Elevation solaire
// ---------------------------------------------------------------------------

describe('solarElevation', () => {
  it('midi solaire a Ouistreham en juillet -- elevation ~62deg', () => {
    // 15 juillet 2024, midi UTC+2 -> 10h UTC ; midi solaire ~11h30 UTC
    const dt = new Date('2024-07-15T11:30:00Z');
    const elev = solarElevation(49.277, -0.246, dt);
    expect(elev).toBeGreaterThan(55);
    expect(elev).toBeLessThan(70);
  });

  it('soleil sous horizon la nuit -- elevation negative', () => {
    const dt = new Date('2024-07-15T22:00:00Z');
    const elev = solarElevation(49.277, -0.246, dt);
    expect(elev).toBeLessThan(0);
  });

  it('elevation basse en hiver a midi -- ~20deg', () => {
    const dt = new Date('2024-12-21T11:00:00Z');
    const elev = solarElevation(49.277, -0.246, dt);
    expect(elev).toBeGreaterThan(15);
    expect(elev).toBeLessThan(25);
  });
});

// ---------------------------------------------------------------------------
// Transmission de surface (Fresnel)
// ---------------------------------------------------------------------------

describe('surfaceTransmission', () => {
  it('soleil au zenith (90deg), ciel clair -> quasi 1', () => {
    const T = surfaceTransmission(90, 0);
    expect(T).toBeGreaterThan(0.97);
  });

  it('soleil sous horizon -> 0', () => {
    expect(surfaceTransmission(0, 0)).toBe(0);
    expect(surfaceTransmission(-10, 0.5)).toBe(0);
  });

  it('ciel couvert -> T proche T_DIFFUSE=0.934', () => {
    const T = surfaceTransmission(45, 1.0);
    expect(T).toBeCloseTo(0.934, 2);
  });

  it('angle rasant (5deg) -> forte perte Fresnel (T < 0.5)', () => {
    const T = surfaceTransmission(5, 0);
    expect(T).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// computeLightProfile -- scenarios de calibration Manche orientale
// ---------------------------------------------------------------------------

describe('computeLightProfile', () => {
  it('scenario hivernal couvert : lampe necessaire ou noir a 10m', () => {
    // Feb overcast : 30 W/m2, elevation 10deg, couvert 1.0, kd=0.7
    const p = computeLightProfile(30, 10, 1.0, 0.7, 10);
    expect(p.darkDepthM).toBeGreaterThan(5);
    expect(p.darkDepthM).toBeLessThan(15);
    expect(p.tier).toMatch(/lamp_needed|black/);
  });

  it('bloom printanier : visibilite ~1-2m (kd=1.5)', () => {
    // April bloom : 300 W/m2, elevation 45deg, kd=1.5
    const p = computeLightProfile(300, 45, 0.3, 1.5, 10);
    expect(p.visibilityM).toBeGreaterThan(1.0);
    expect(p.visibilityM).toBeLessThan(2.0);
  });

  it('juillet noon eau claire : lisible bien au-dela de 20m', () => {
    // July noon : 800 W/m2, elevation 62deg, kd=0.10
    const p = computeLightProfile(800, 62, 0.1, 0.10, 20);
    expect(p.irradianceAtDepthLux).toBeGreaterThan(100);
    expect(p.tier).toBe('readable');
    expect(p.darkDepthM).toBeGreaterThan(50);
  });

  it('nuit -> tout a 0, tier black', () => {
    const p = computeLightProfile(0, -10, 0.5, 0.3, 10);
    expect(p.irradianceAtDepthLux).toBe(0);
    expect(p.surfaceIrradianceLux).toBe(0);
    expect(p.tier).toBe('black');
  });

  it('champs retournes coherents', () => {
    const p = computeLightProfile(500, 50, 0.2, 0.2, 15);
    expect(p.solarElevationDeg).toBe(50);
    expect(p.darkDepthM).toBeGreaterThanOrEqual(0);
    // darkDepth (5 lux) > colorLostDepth (50 lux) car 5 < 50
    expect(p.darkDepthM).toBeGreaterThanOrEqual(p.colorLostDepthM);
  });
});

// ---------------------------------------------------------------------------
// findLampRequiredHour
// ---------------------------------------------------------------------------

describe('findLampRequiredHour', () => {
  it('retourne null si jamais noir', () => {
    const profiles = Array.from({ length: 24 }, () =>
      computeLightProfile(400, 50, 0.2, 0.1, 10)
    );
    const times = profiles.map((_, i) => `2024-07-15T${String(i).padStart(2, '0')}:00`);
    expect(findLampRequiredHour(times, profiles)).toBeNull();
  });

  it("retourne l'heure apres le dernier creneau non-noir", () => {
    const profiles = Array.from({ length: 24 }, (_, i) =>
      i < 12
        ? computeLightProfile(600, 60, 0.1, 0.1, 10)
        : computeLightProfile(0, -5, 0.5, 0.3, 10)
    );
    const times = profiles.map((_, i) => `2024-07-15T${String(i).padStart(2, '0')}:00`);
    const result = findLampRequiredHour(times, profiles);
    expect(result).toBe('2024-07-15T12:00');
  });
});
