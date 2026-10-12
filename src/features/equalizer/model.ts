import { z } from 'zod';

export const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const eqSchema = z.object({
  enabled: z.boolean(),
  bands: z.array(z.number().min(-12).max(12)).length(10),
  shape: z.enum(['graphic', 'peaking']).optional(),
});
export type EqSettings = z.infer<typeof eqSchema>;
export function sameEq(a: EqSettings, b: EqSettings): boolean {
  return (
    a.enabled === b.enabled &&
    (a.shape ?? 'graphic') === (b.shape ?? 'graphic') &&
    a.bands.length === b.bands.length &&
    a.bands.every((gain, index) => gain === b.bands[index])
  );
}
export const flatEq: EqSettings = { enabled: true, bands: Array.from({ length: 10 }, () => 0) };
export const presets: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass boost': [6, 5, 3, 1, 0, 0, 0, 0, 0, 0],
  Vocal: [-2, -2, -1, 0, 2, 3, 4, 3, 1, 0],
  Rock: [4, 3, 1, -1, -2, 0, 2, 3, 3, 2],
  Classical: [2, 1, 0, 0, -1, -1, 0, 1, 2, 2],
  Gaming: [0, 0, -1, -2, 0, 2, 4, 3, 1, 0],
  'Warm and smooth': [1, 1, 0.5, 0, 0, 0, -0.5, -1, -2, -1.5],
  'Dialogue clarity': [-3, -3, -2, -1, 0, 0.5, 2, 1, 0, -1],
  'Bass control': [-2, -3, -3, -1, 0, 0, 0, 0, 0, 0],
  'Treble soften': [0, 0, 0, 0, 0, 0, -0.5, -1.5, -3, -2],
  Electronic: [2, 3, 1, 0, -1, -0.5, 0, 0.5, 1, 0.5],
  'Acoustic detail': [-1, -0.5, 0, 0, -0.5, 0, 0.5, 1, 0.5, 0.5],
  'FPS focus': [-3, -3, -2, -1, -0.5, 0, 1, 1.5, 0.5, -1],
  'Movie night': [1.5, 2, 1, 0, -0.5, 0, 0.5, 1, 0, -0.5],
};
export const presetNotes: Record<string, string> = {
  'Warm and smooth': 'More bass body, softer treble.',
  'Dialogue clarity': 'Less rumble, more voice presence.',
  'Bass control': 'Cuts low-end boom without boosting the highs.',
  'Treble soften': 'Softens bright treble. Try it if cymbals sound harsh.',
  Electronic: 'Adds low-bass punch with a light lift in detail.',
  'Acoustic detail': 'Light presence and treble lift for acoustic music.',
  'FPS focus': 'Less bass, slight presence lift. No surround added.',
  'Movie night': 'Light bass and dialogue lift for films.',
};
const peakingSampleRate = 48000;
const peakingQ = 1.41;
const probeCount = 512;
function biquadMagnitude([b0, b1, b2]: number[], w: number): number {
  const real = (b0 ?? 0) + (b1 ?? 0) * Math.cos(w) + (b2 ?? 0) * Math.cos(2 * w);
  const imaginary = -((b1 ?? 0) * Math.sin(w) + (b2 ?? 0) * Math.sin(2 * w));
  return Math.hypot(real, imaginary);
}
function peakingBandDb(gain: number, frequency: number, w: number): number {
  if (gain === 0) return 0;
  const amplitude = 10 ** (gain / 40);
  const w0 = (2 * Math.PI * frequency) / peakingSampleRate;
  const alpha = Math.sin(w0) / (2 * peakingQ);
  const cos0 = Math.cos(w0);
  const numerator = [1 + alpha * amplitude, -2 * cos0, 1 - alpha * amplitude];
  const denominator = [1 + alpha / amplitude, -2 * cos0, 1 - alpha / amplitude];
  return 20 * Math.log10(biquadMagnitude(numerator, w) / biquadMagnitude(denominator, w));
}
export function peakingPeakDb(bands: number[]): number {
  let peak = 0;
  for (let index = 0; index < probeCount; index++) {
    const frequency = 20 * 1000 ** (index / (probeCount - 1));
    const w = (2 * Math.PI * frequency) / peakingSampleRate;
    const total = frequencies.reduce(
      (sum, bandFrequency, band) => sum + peakingBandDb(bands[band] ?? 0, bandFrequency, w),
      0,
    );
    peak = Math.max(peak, total);
  }
  return peak;
}
export function getHeadroom(settings: EqSettings): number {
  if (!settings.enabled) return 1;
  if (settings.shape === 'peaking') return 10 ** (-Math.max(0, peakingPeakDb(settings.bands)) / 20);
  const boost = settings.bands.reduce((total, gain) => total + Math.max(0, gain), 0);
  return 10 ** (-boost / 20);
}
