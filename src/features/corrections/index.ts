import { z } from 'zod';

export const correctionIndexSchema = z.object({
  commit: z.string().max(80),
  entries: z.array(
    z.tuple([
      z.string().max(200),
      z.string().max(100),
      z.string().max(40),
      z.array(z.number().min(-12).max(12)).length(10),
    ]),
  ),
});
export type CorrectionEntry = z.infer<typeof correctionIndexSchema>['entries'][number];

let cached: Promise<CorrectionEntry[]> | null = null;
export function loadCorrections(): Promise<CorrectionEntry[]> {
  cached ??= fetch('/corrections/index.json')
    .then(async (response) => {
      if (!response.ok) throw new Error('Headphone list unavailable.');
      return correctionIndexSchema.parse(await response.json()).entries;
    })
    .catch((error: unknown) => {
      cached = null;
      throw error;
    });
  return cached;
}
