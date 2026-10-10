import type { NativeState } from '@/features/system-audio/schema';

const neutral = { id: 'neutral', name: 'Openear', model: null, logo: null } as const;
const redragon = {
  id: 'redragon',
  name: 'Redragon',
  model: 'H858',
  logo: '/brands/redragon.svg',
} as const;
export function manufacturerForOutput(state: NativeState | null, selected: string | null) {
  const output = state?.outputs.find((item) => item.id === selected);
  const usb = state?.usbDevice;
  const usbReceiver = output?.receiver && usb?.vendorId === '3206' && usb.productId === '0881';
  return usbReceiver || output?.brand === 'redragon' ? redragon : neutral;
}
