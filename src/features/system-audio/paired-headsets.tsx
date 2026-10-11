import { useState } from 'react';
import { Bluetooth } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PairedHeadsetsDialog } from './paired-headsets-dialog';
import { runOperation, useNativeAudio } from './store';
import type { NativeState } from './schema';

const none: NativeState['pairedDevices'] = [];

export function PairedHeadsets() {
  const [pairing, setPairing] = useState(false);
  const busy = useNativeAudio((store) => store.busy);
  const devices = useNativeAudio((store) => store.state?.pairedDevices ?? none);
  if (!devices.length) return null;
  return (
    <>
      <div className="paired-entry">
        <span>
          Paired headsets
          <span className="control-help">{devices.length} not connected</span>
        </span>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => setPairing(true)}>
          <Bluetooth />
          Connect headset
        </Button>
      </div>
      <PairedHeadsetsDialog
        open={pairing}
        onOpenChange={setPairing}
        devices={devices}
        busy={busy}
        onConnect={(address) => runOperation({ operation: 'connect', address })}
      />
    </>
  );
}
