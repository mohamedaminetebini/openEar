import { useState } from 'react';
import { Bluetooth } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { NativeState } from './schema';

export function PairedHeadsetsDialog({
  open,
  onOpenChange,
  devices,
  busy,
  onConnect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: NativeState['pairedDevices'];
  busy: boolean;
  onConnect: (address: string) => Promise<boolean>;
}) {
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const visible = term
    ? devices.filter((device) => device.name.toLowerCase().includes(term))
    : devices;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery('');
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a headset</DialogTitle>
          <DialogDescription>
            Paired headsets that are off or out of range. Turn one on, then connect it.
          </DialogDescription>
        </DialogHeader>
        {devices.length > 6 && (
          <Input
            type="search"
            placeholder="Search headsets"
            aria-label="Search headsets"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        )}
        <ul className="paired-list">
          {visible.map((device) => (
            <li key={device.address}>
              <Bluetooth aria-hidden="true" />
              <span>{device.name}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  if (await onConnect(device.address)) onOpenChange(false);
                }}
              >
                Connect
              </Button>
            </li>
          ))}
        </ul>
        {visible.length === 0 && <p className="empty-copy">No headsets match “{query}”.</p>}
      </DialogContent>
    </Dialog>
  );
}
