import { expect, it } from 'vitest';
import { deviceKey, deviceSoundsSchema } from './device-sound';
import type { NativeState } from '@/features/system-audio/schema';

type Output = NativeState['outputs'][number];
const base: Output = { id: 'sink', name: 'Sink', receiver: false, transport: 'other' };

it('keys Bluetooth outputs by address and everything else by sink', () => {
  expect(
    deviceKey({ ...base, transport: 'bluetooth', address: 'b0:38:e2:5b:7e:78', id: 'bluez' }),
  ).toBe('bt:B0:38:E2:5B:7E:78');
  expect(deviceKey({ ...base, transport: 'bluetooth', id: 'bluez' })).toBe('sink:bluez');
  expect(deviceKey({ ...base, transport: 'usb', id: 'usb-sink' })).toBe('sink:usb-sink');
  expect(deviceKey({ ...base, id: 'speaker' })).toBe('sink:speaker');
});

it('fills missing correction and tilt fields when parsing stored sounds', () => {
  const parsed = deviceSoundsSchema.parse({
    'sink:x': { eq: { enabled: true, bands: Array<number>(10).fill(0) } },
  });
  expect(parsed['sink:x']).toEqual({
    eq: { enabled: true, bands: Array<number>(10).fill(0) },
    correction: null,
    bass: 0,
    treble: 0,
  });
});
