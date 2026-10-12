import { expect, it } from 'vitest';
import { manufacturerForOutput } from './manufacturer';
import type { NativeState } from '@/features/system-audio/schema';
const state: NativeState = {
  outputs: [
    { id: 'receiver', name: 'Output', receiver: true, transport: 'usb' },
    { id: 'speaker', name: 'Redragon name alone', receiver: false, transport: 'other' },
  ],
  active: false,
  target: null,
  defaultOutput: null,
  pairedDevices: [],
  eq: { enabled: true, bands: Array<number>(10).fill(0) },
  receiver: null,
  usbDevice: {
    vendorId: '3206',
    productId: '0881',
    revision: '0100',
    manufacturer: 'OEM',
    product: 'USB Audio',
  },
  error: null,
};
it('uses verified receiver identifiers rather than its marketing or USB manufacturer string', () => {
  expect(manufacturerForOutput(state, 'receiver').id).toBe('redragon');
  expect(manufacturerForOutput(state, 'speaker').id).toBe('neutral');
  expect(
    manufacturerForOutput(
      { ...state, usbDevice: { ...state.usbDevice!, productId: '0882' } },
      'receiver',
    ).id,
  ).toBe('neutral');
});
it('returns a neutral theme after unplugging or before discovery', () => {
  expect(manufacturerForOutput(null, null).id).toBe('neutral');
  expect(manufacturerForOutput({ ...state, usbDevice: null }, 'receiver').id).toBe('neutral');
});
it('applies the Soundcore logo only to outputs with a verified Soundcore identity', () => {
  const soundcore: NativeState = {
    ...state,
    usbDevice: null,
    outputs: [
      { id: 'sc', name: 'Q21i', receiver: false, transport: 'bluetooth', brand: 'soundcore' },
      { id: 'other', name: 'Other headset', receiver: false, transport: 'bluetooth' },
    ],
  };
  expect(manufacturerForOutput(soundcore, 'sc')).toMatchObject({
    id: 'soundcore',
    logo: '/brands/soundcore.svg',
  });
  expect(manufacturerForOutput(soundcore, 'other').id).toBe('neutral');
});

it('does not apply a brand to Bluetooth headsets without a verified identity', () => {
  const bluetooth: NativeState = {
    ...state,
    usbDevice: null,
    outputs: [
      { id: 'bt', name: 'H858', receiver: false, transport: 'bluetooth' },
      { id: 'bt-other', name: 'Other headset', receiver: false, transport: 'bluetooth' },
    ],
  };
  expect(manufacturerForOutput(bluetooth, 'bt').id).toBe('neutral');
  expect(manufacturerForOutput(bluetooth, 'bt-other').id).toBe('neutral');
});
