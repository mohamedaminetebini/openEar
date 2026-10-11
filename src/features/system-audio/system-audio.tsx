import { memo } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionBar } from '@/components/section-bar';
import { initializeDesktopAudio, useNativeAudio } from './store';
import { ReceiverControls } from './receiver-controls';
import { OutputControls } from './output-controls';

function SystemAudioPanelBase({ controls = false }: { controls?: boolean }) {
  const busy = useNativeAudio((store) => store.busy);
  const paired = useNativeAudio((store) => store.paired);
  const nativeError = useNativeAudio((store) => store.error);
  const stateError = useNativeAudio((store) => store.state?.error);
  const headingId = controls ? 'receiver-heading' : 'system-audio-heading';
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
        <ReceiverControls />
      ) : (
        <OutputControls />
      )}
      {(nativeError || stateError) && (
        <p role="alert" className="inline-error">
          {nativeError || stateError}
        </p>
      )}
    </section>
  );
}

export const SystemAudioPanel = memo(SystemAudioPanelBase);
