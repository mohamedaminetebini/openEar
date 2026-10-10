import { expect, it, vi } from 'vitest';
import { applyProfile } from './apply-profile';
import type { Profile } from '@/lib/db/database';
const profile: Profile = {
  id: 'b6967454-8b61-4e32-93bf-2fe452e24d7f',
  name: 'Focus',
  eq: { enabled: true, bands: Array<number>(10).fill(0) },
  targetDeviceId: null,
  hardware: null,
  createdAt: 1,
  updatedAt: 1,
};
it('applies a saved audio profile without a proprietary connection', async () => {
  const audio = vi.fn();
  await applyProfile(profile, audio);
  expect(audio).toHaveBeenCalledWith(profile.eq);
});
it('preserves hardware profiles in storage but refuses unsupported commands', async () => {
  const audio = vi.fn();
  await expect(
    applyProfile({ ...profile, hardware: { noise: 'anc', equalizer: null } }, audio),
  ).rejects.toThrow('integration');
  expect(audio).not.toHaveBeenCalled();
});
it('awaits native audio application and preserves its failure', async () => {
  await expect(
    applyProfile(profile, async () => {
      throw new Error('Native EQ failed');
    }),
  ).rejects.toThrow('Native EQ failed');
});
