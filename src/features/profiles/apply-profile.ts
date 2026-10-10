import { profileSchema, type Profile } from '@/lib/db/database';
import type { EqSettings } from '@/features/equalizer/model';
export async function applyProfile(
  input: Profile,
  audio: (eq: EqSettings) => void | Promise<void>,
) {
  const profile = profileSchema.parse(input);
  if (profile.hardware)
    throw new Error('This profile needs a manufacturer integration that is not installed.');
  await audio(profile.eq);
}
