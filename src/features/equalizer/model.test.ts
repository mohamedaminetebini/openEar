import { describe, expect, it } from 'vitest';
import { eqSchema, getHeadroom, presets } from './model';

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
