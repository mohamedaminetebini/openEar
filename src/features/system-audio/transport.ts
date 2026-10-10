import type { NativeState } from './schema';

export type Transport = NativeState['outputs'][number]['transport'];

export const transportNames: Record<Transport, string> = {
  usb: 'USB',
  bluetooth: 'Bluetooth',
  other: 'Output',
};
