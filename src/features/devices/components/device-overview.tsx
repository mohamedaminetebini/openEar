import { memo } from 'react';
import { Battery, Cable } from 'lucide-react';
import { useNativeAudio } from '@/features/system-audio/store';
import { TransportIcon } from '@/features/system-audio/transport-icon';
import { manufacturerForOutput } from '../manufacturer';
function DeviceOverviewBase() {
  const state = useNativeAudio((store) => store.state);
  const brand = manufacturerForOutput(
    state,
    state?.outputs.find((output) => output.receiver)?.id ?? null,
  );
  const usb = state?.usbDevice;
  const selected = useNativeAudio((store) => store.selectedOutput);
  const chosen = state?.outputs.find((output) => output.id === selected);
  const transport = chosen?.transport ?? 'other';
  return (
    <section className="panel device-panel" aria-labelledby="device-heading">
      <div className="device-summary">
        <TransportIcon transport={transport} />
        <div>
          <h2 id="device-heading">
            {brand.model ? `${brand.name} ${brand.model}` : 'USB receiver'}
          </h2>
          <p>
            {usb
              ? 'USB receiver detected. Switch your headset to 2.4 GHz mode.'
              : 'Plug in the USB receiver or connect headphones in sound settings.'}
          </p>
        </div>
      </div>
      {chosen?.battery != null && (
        <dl className="device-details">
          <div>
            <dt>
              <Battery />
              Headset battery
            </dt>
            <dd>{chosen.battery}%</dd>
          </div>
        </dl>
      )}
      {usb && (
        <dl className="device-details">
          <div>
            <dt>
              <Cable />
              USB receiver
            </dt>
            <dd>
              {usb.vendorId}:{usb.productId}
            </dd>
          </div>
          <div>
            <dt>Manufacturer reported by USB</dt>
            <dd>{usb.manufacturer || 'Not reported'}</dd>
          </div>
          <div>
            <dt>Product</dt>
            <dd>{usb.product || 'Not reported'}</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd>{usb.revision}</dd>
          </div>
        </dl>
      )}
      <div className="hardware-note">
        <h3>Available on this receiver</h3>
        <p>Playback volume and mute, microphone gain and mute, automatic gain.</p>
        <p className="fine-print">
          ANC and internal 7.1 are not available. USB detection does not confirm the wireless link.
        </p>
      </div>
    </section>
  );
}

export const DeviceOverview = memo(DeviceOverviewBase);
