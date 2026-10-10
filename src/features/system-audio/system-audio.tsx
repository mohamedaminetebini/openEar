import { memo, useCallback, useState } from 'react';
import { Volume2, Mic, RefreshCw, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SectionBar } from '@/components/section-bar';
import { SettingRow } from '@/components/setting-row';
import { useApp } from '@/stores/app-store';
import { nativeOperation, useNativeAudio, initializeDesktopAudio, selectOutput } from './store';
import type { NativeCommand, NativeState } from './schema';
import { TransportIcon } from './transport-icon';
import { transportNames } from './transport';

function SystemAudioPanelBase({ controls = false }: { controls?: boolean }) {
  const busy = useNativeAudio((store) => store.busy);
  const paired = useNativeAudio((store) => store.paired);
  const chosen = useNativeAudio((store) => store.selectedOutput);
  const nativeError = useNativeAudio((store) => store.error);
  const state = useNativeAudio((store) => store.state);
  const eq = useApp((store) => store.eq);
  const run = useCallback(async (input: NativeCommand) => {
    try {
      await nativeOperation(input);
      return true;
    } catch {
      return false;
    }
  }, []);
  const headingId = controls ? 'receiver-heading' : 'system-audio-heading';
  const selectedOutput = state?.outputs.find((output) => output.id === chosen);
  const selectedTransport = selectedOutput?.transport;
  return (
    <section
      className={`panel ${controls ? 'receiver-panel' : 'output-panel'}`}
      aria-labelledby={headingId}
    >
      <SectionBar id={headingId} title={controls ? 'Receiver controls' : 'Audio output'}>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void initializeDesktopAudio()}
          aria-label="Refresh audio devices"
        >
          <RefreshCw />
          Refresh
        </Button>
      </SectionBar>
      {!paired ? (
        <p className="empty-copy">
          No audio outputs found. Connect a USB receiver or pick your headphones in sound settings.
        </p>
      ) : controls ? (
        state?.receiver ? (
          <div className="receiver-controls">
            <LevelControl
              label="Receiver playback volume"
              icon={Volume2}
              value={state.receiver.volume}
              disabled={busy}
              commit={(value) => run({ operation: 'volume', value })}
            />
            <SettingRow
              title="Mute receiver output"
              control={
                <Switch
                  checked={state.receiver.mute}
                  disabled={busy}
                  onCheckedChange={(value) => void run({ operation: 'mute', value })}
                  aria-label="Mute receiver output"
                />
              }
            />
            <LevelControl
              label="Receiver microphone gain"
              icon={Mic}
              value={state.receiver.micGain}
              disabled={busy}
              commit={(value) => run({ operation: 'micGain', value })}
            />
            <SettingRow
              title="Mute receiver microphone"
              control={
                <Switch
                  checked={state.receiver.micMute}
                  disabled={busy}
                  onCheckedChange={(value) => void run({ operation: 'micMute', value })}
                  aria-label="Mute receiver microphone"
                />
              }
            />
            <SettingRow
              title="Microphone automatic gain"
              description="Adjusts microphone sensitivity automatically. This is not ANC."
              control={
                <Switch
                  checked={state.receiver.autoGain}
                  disabled={busy}
                  onCheckedChange={(value) => void run({ operation: 'autoGain', value })}
                  aria-label="Microphone automatic gain"
                />
              }
            />
          </div>
        ) : (
          <p className="empty-copy">
            Connect the H858 USB receiver for playback and microphone controls. EQ works with other
            outputs.
          </p>
        )
      ) : (
        <div className="output-content">
          <div className="output-actions">
            <div className="output-field">
              <div className="output-field-head">
                <label htmlFor="system-output">Listen through</label>
                {selectedOutput && selectedOutput.transport !== 'other' && (
                  <span className="transport-badge">
                    <TransportIcon transport={selectedOutput.transport} />
                    {transportNames[selectedOutput.transport]}
                  </span>
                )}
              </div>
              <select
                id="system-output"
                value={chosen ?? ''}
                disabled={busy || state?.active}
                onChange={(event) => selectOutput(event.target.value)}
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
                void run(
                  state?.active
                    ? { operation: 'stop' }
                    : { operation: 'start', target: chosen ?? '', eq },
                )
              }
            >
              {busy
                ? 'Updating audio…'
                : state?.active
                  ? 'Turn off desktop EQ'
                  : 'Enable desktop EQ'}
            </Button>
          </div>
          <p className="fine-print">
            {state?.active
              ? 'EQ is on. Turn it off to restore your previous output.'
              : 'Applies your EQ to all desktop audio on this output.'}
          </p>
          {selectedTransport === 'bluetooth' && (
            <p className="fine-print">
              Bluetooth can drop. EQ stops if the headset disconnects or switches to call mode.
            </p>
          )}
          {state?.active && (
            <p className="fine-print">
              Turn EQ off to change output. Closing the window keeps EQ running.
            </p>
          )}
        </div>
      )}
      {(nativeError || state?.error) && (
        <p role="alert" className="inline-error">
          {nativeError || state?.error}
        </p>
      )}
    </section>
  );
}

function outputLabel(output: NativeState['outputs'][number]) {
  if (output.receiver) return 'Redragon H858 · USB receiver';
  return output.transport === 'bluetooth' ? `${output.name} · Bluetooth` : output.name;
}
function LevelControl({
  label,
  icon: Icon,
  value,
  disabled,
  commit,
}: {
  label: string;
  icon: LucideIcon;
  value: number;
  disabled: boolean;
  commit: (value: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const apply = () => {
    if (draft === null) return;
    setSaving(true);
    void commit(draft)
      .then((success) => {
        if (success) setDraft(null);
      })
      .finally(() => setSaving(false));
  };
  return (
    <div className="level-control">
      <div className="level-head">
        <span className="level-title">
          <Icon aria-hidden="true" />
          {label}
        </span>
        <output>{draft ?? value}%</output>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || saving || draft === null}
          onClick={apply}
        >
          {saving ? 'Applying…' : 'Apply'}
        </Button>
      </div>
      <input
        aria-label={label}
        type="range"
        min="0"
        max="100"
        step="1"
        value={draft ?? value}
        disabled={disabled || saving}
        onChange={(event) => setDraft(Number(event.target.value))}
      />
    </div>
  );
}

export const SystemAudioPanel = memo(SystemAudioPanelBase);
