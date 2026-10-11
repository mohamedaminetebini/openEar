import { Mic, Volume2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { SettingRow } from '@/components/setting-row';
import { runOperation, useNativeAudio } from './store';
import { LevelSlider } from './level-slider';

export function ReceiverControls() {
  const busy = useNativeAudio((store) => store.busy);
  const receiver = useNativeAudio((store) => store.state?.receiver);
  if (!receiver) {
    return (
      <p className="empty-copy">
        Connect a supported USB receiver for playback and microphone controls. EQ works with other
        outputs.
      </p>
    );
  }
  return (
    <div className="receiver-controls">
      <LevelSlider
        label="Receiver playback volume"
        icon={Volume2}
        value={receiver.volume}
        disabled={busy}
        commit={(value) => runOperation({ operation: 'volume', value })}
      />
      <SettingRow
        title="Mute receiver output"
        control={
          <Switch
            checked={receiver.mute}
            disabled={busy}
            onCheckedChange={(value) => void runOperation({ operation: 'mute', value })}
            aria-label="Mute receiver output"
          />
        }
      />
      <LevelSlider
        label="Receiver microphone gain"
        icon={Mic}
        value={receiver.micGain}
        disabled={busy}
        commit={(value) => runOperation({ operation: 'micGain', value })}
      />
      <SettingRow
        title="Mute receiver microphone"
        control={
          <Switch
            checked={receiver.micMute}
            disabled={busy}
            onCheckedChange={(value) => void runOperation({ operation: 'micMute', value })}
            aria-label="Mute receiver microphone"
          />
        }
      />
      <SettingRow
        title="Microphone automatic gain"
        description="Adjusts microphone sensitivity automatically. This is not ANC."
        control={
          <Switch
            checked={receiver.autoGain}
            disabled={busy}
            onCheckedChange={(value) => void runOperation({ operation: 'autoGain', value })}
            aria-label="Microphone automatic gain"
          />
        }
      />
    </div>
  );
}
