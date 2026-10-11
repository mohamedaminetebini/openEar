import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { runOperation, useNativeAudio } from './store';

const noiseModes = [
  ['off', 'Off'],
  ['noiseCancellation', 'Noise cancellation'],
  ['transparency', 'Transparency'],
] as const;

export function NoiseControl({ address }: { address: string }) {
  const busy = useNativeAudio((store) => store.busy);
  const noise = useNativeAudio((store) => store.state?.noise);
  const known = noise?.address === address;
  const attempted = useRef(false);
  useEffect(() => {
    if (busy || known || attempted.current) return;
    attempted.current = true;
    void runOperation({ operation: 'noise', address, mode: null });
  }, [address, busy, known]);
  return (
    <div className="noise-control">
      <span>Noise control</span>
      <div className="noise-modes" role="group" aria-label="Noise control">
        {noiseModes.map(([mode, label]) => {
          const active = known && noise?.mode === mode;
          return (
            <Button
              key={mode}
              variant={active ? 'default' : 'outline'}
              size="sm"
              aria-pressed={active}
              disabled={busy}
              onClick={() => void runOperation({ operation: 'noise', address, mode })}
            >
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
