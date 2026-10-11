import { z } from 'zod';

export const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const eqSchema = z.object({
  enabled: z.boolean(),
  bands: z.array(z.number().min(-12).max(12)).length(10),
});
export type EqSettings = z.infer<typeof eqSchema>;
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
export function getHeadroom(settings: EqSettings): number {
  const boost = settings.enabled
    ? settings.bands.reduce((total, gain) => total + Math.max(0, gain), 0)
    : 0;
  return 10 ** (-boost / 20);
}
