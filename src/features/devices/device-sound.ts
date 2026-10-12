import { z } from 'zod';
import { eqSchema } from '@/features/equalizer/model';
import type { NativeState } from '@/features/system-audio/schema';

type Output = NativeState['outputs'][number];

export const deviceSoundSchema = z.object({
  eq: eqSchema,
  correction: z
    .object({
      name: z.string().max(200),
      source: z.string().max(100),
      bands: z.array(z.number().min(-12).max(12)).length(10),
    })
    .nullable()
    .default(null),
  bass: z.number().min(-6).max(6).default(0),
  treble: z.number().min(-6).max(6).default(0),
});
export type DeviceSound = z.infer<typeof deviceSoundSchema>;
export const deviceSoundsSchema = z.record(z.string().max(600), deviceSoundSchema);
export type DeviceSounds = z.infer<typeof deviceSoundsSchema>;

export function deviceKey(output: Output): string {
  if (output.transport === 'bluetooth' && output.address)
    return `bt:${output.address.toUpperCase()}`;
  return `sink:${output.id}`;
}
