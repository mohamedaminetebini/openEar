import { Battery, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { outputById, soundFor, useApp } from '@/stores/app-store';
import { runOperation, selectOutput, useNativeAudio } from './store';
import type { NativeState } from './schema';
import { TransportIcon } from './transport-icon';
import { transportNames } from './transport';
import { LevelSlider } from './level-slider';
import { NoiseControl } from './noise-control';
import { PairedHeadsets } from './paired-headsets';

function startEq(target: string) {
  const output = outputById(target);
  return runOperation({
    operation: 'start',
    target,
    eq: output ? soundFor(output) : useApp.getState().eq,
  });
}

function outputLabel(output: NativeState['outputs'][number]) {
  if (output.receiver) return `${output.name} · USB receiver`;
  return output.transport === 'bluetooth' ? `${output.name} · Bluetooth` : output.name;
}

export function OutputControls() {
  const busy = useNativeAudio((store) => store.busy);
  const chosen = useNativeAudio((store) => store.selectedOutput);
  const state = useNativeAudio((store) => store.state);
  const selectedOutput = state?.outputs.find((output) => output.id === chosen);
  return (
    <div className="output-content">
      <div className="output-actions">
        <div className="output-field">
          <div className="output-field-head">
            <label htmlFor="system-output">Listen through</label>
            <div className="output-badges">
              {selectedOutput && selectedOutput.transport !== 'other' && (
                <span className="transport-badge">
                  <TransportIcon transport={selectedOutput.transport} />
                  {transportNames[selectedOutput.transport]}
                </span>
              )}
              {selectedOutput?.battery != null && (
                <span className="transport-badge">
                  <Battery />
                  {selectedOutput.battery}%
                </span>
              )}
            </div>
          </div>
          <select
            id="system-output"
            value={chosen ?? ''}
            disabled={busy}
            onChange={(event) => {
              const id = event.target.value;
              if (state?.active) void startEq(id);
              else selectOutput(id);
            }}
          >
            {!state?.outputs.length && <option value="">No outputs available</option>}
            {state?.outputs.map((output) => (
              <option key={output.id} value={output.id}>
                {outputLabel(output)}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant={state?.active ? 'outline' : 'default'}
          disabled={busy || !chosen}
          onClick={() =>
            void (state?.active ? runOperation({ operation: 'stop' }) : startEq(chosen ?? ''))
          }
        >
          {busy ? 'Updating audio…' : state?.active ? 'Turn off desktop EQ' : 'Enable desktop EQ'}
        </Button>
      </div>
      {selectedOutput?.volume != null && (
        <LevelSlider
          key={selectedOutput.id}
          label="Output volume"
          icon={Volume2}
          value={selectedOutput.volume}
          disabled={busy}
          commit={(value) =>
            runOperation({ operation: 'outputVolume', output: selectedOutput.id, value })
          }
        />
      )}
      {selectedOutput?.address && selectedOutput.noiseControl && (
        <NoiseControl key={selectedOutput.address} address={selectedOutput.address} />
      )}
      <PairedHeadsets />
    </div>
  );
}
