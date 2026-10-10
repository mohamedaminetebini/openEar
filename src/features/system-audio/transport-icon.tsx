import { Bluetooth, Headphones, Usb, type LucideIcon } from 'lucide-react';
import type { Transport } from './transport';

const icons: Record<Transport, LucideIcon> = {
  usb: Usb,
  bluetooth: Bluetooth,
  other: Headphones,
};

export function TransportIcon({
  transport,
  className,
}: {
  transport: Transport;
  className?: string;
}) {
  const Icon = icons[transport];
  return <Icon aria-hidden="true" className={className} />;
}
