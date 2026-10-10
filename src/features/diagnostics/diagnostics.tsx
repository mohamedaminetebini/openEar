import { useState } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionBar } from '@/components/section-bar';
import { useNativeAudio } from '@/features/system-audio/store';
export function Diagnostics() {
  const native = useNativeAudio();
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const report = JSON.stringify(
    {
      application: 'Openear desktop 0.1',
      platform: 'Linux / PipeWire',
      audioReady: native.paired,
      active: native.state?.active ?? false,
      outputCount: native.state?.outputs.length ?? 0,
      usbReceiver: !!native.state?.usbDevice,
      receiverControls: !!native.state?.receiver,
      operationFailed: !!(native.error || native.state?.error),
      timestamp: new Date().toISOString(),
    },
    null,
    2,
  );
  return (
    <section className="panel diagnostics-panel">
      <SectionBar title="Audio diagnostics">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(report).then(
              () => setCopyStatus('Copied without device names, identifiers, or audio filenames.'),
              () => setCopyStatus('Select and copy the report below.'),
            );
          }}
        >
          <Copy />
          Copy safe report
        </Button>
      </SectionBar>
      <dl className="device-details">
        <div>
          <dt>Audio service</dt>
          <dd>{native.paired ? 'Available' : 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Desktop EQ</dt>
          <dd>{native.state?.active ? 'Active' : 'Off'}</dd>
        </div>
        <div>
          <dt>USB receiver</dt>
          <dd>{native.state?.usbDevice ? 'Detected' : 'Not detected'}</dd>
        </div>
      </dl>
      {copyStatus && (
        <p role="status" className="fine-print">
          {copyStatus}
        </p>
      )}
      <details className="protocol-details">
        <summary>View safe diagnostic report</summary>
        <pre tabIndex={0}>{report}</pre>
      </details>
    </section>
  );
}
