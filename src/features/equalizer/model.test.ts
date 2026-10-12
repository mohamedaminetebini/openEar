import { describe, expect, it } from 'vitest';
import { eqSchema, flatEq, getHeadroom, presets, sameEq, type EqSettings } from './model';

describe('audio settings boundary', () => {
  it('accepts a ten-band setting and rejects wrong lengths and out-of-range gain', () => {
    expect(eqSchema.safeParse({ enabled: true, bands: Array(10).fill(0) }).success).toBe(true);
    expect(eqSchema.safeParse({ enabled: true, bands: [0] }).success).toBe(false);
    expect(eqSchema.safeParse({ enabled: true, bands: Array(10).fill(13) }).success).toBe(false);
    expect(eqSchema.safeParse({ enabled: true, bands: Array(10).fill(NaN) }).success).toBe(false);
  });
  it('reserves headroom for boosted bands and leaves bypass at unity', () => {
    expect(getHeadroom({ enabled: true, bands: [6, 0, 0, 0, 0, 0, 0, 0, 0, 0] })).toBeCloseTo(
      0.501187,
      5,
    );
    expect(getHeadroom({ enabled: false, bands: Array(10).fill(12) })).toBe(1);
    expect(getHeadroom({ enabled: true, bands: Array(10).fill(-6) })).toBe(1);
  });
  it('all built-in presets are valid, with Flat at zero gain', () => {
    expect(Object.keys(presets)).toEqual([
      'Flat',
      'Bass boost',
      'Vocal',
      'Rock',
      'Classical',
      'Gaming',
      'Warm and smooth',
      'Dialogue clarity',
      'Bass control',
      'Treble soften',
      'Electronic',
      'Acoustic detail',
      'FPS focus',
      'Movie night',
    ]);
    expect(presets.Flat).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    Object.values(presets).forEach((bands) =>
      expect(eqSchema.safeParse({ enabled: true, bands }).success).toBe(true),
    );
  });
});

describe('peaking headroom and EQ identity', () => {
  const bands = (values: Partial<Record<number, number>>) =>
    Array.from({ length: 10 }, (_, index) => values[index] ?? 0);

  it('computes peaking headroom from the combined response', () => {
    const single: EqSettings = { enabled: true, bands: bands({ 5: 6 }), shape: 'peaking' };
    expect(-20 * Math.log10(getHeadroom(single))).toBeCloseTo(6, 0);
    expect(getHeadroom({ ...flatEq, shape: 'peaking' })).toBe(1);
    const correction: EqSettings = {
      enabled: true,
      bands: [6.6, 4.6, -0.4, -1.9, -0.1, -0.1, 3.9, -1.4, -2.7, -7.5],
      shape: 'peaking',
    };
    expect(-20 * Math.log10(getHeadroom(correction))).toBeCloseTo(7.46, 2);
  });

  it('treats a missing shape as graphic when comparing EQs', () => {
    expect(sameEq(flatEq, { ...flatEq, shape: 'graphic' })).toBe(true);
    expect(sameEq(flatEq, { ...flatEq, shape: 'peaking' })).toBe(false);
  });
});
