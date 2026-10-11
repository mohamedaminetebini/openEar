import { memo, useCallback, useMemo, useState } from 'react';
import { RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionBar } from '@/components/section-bar';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApp } from '@/stores/app-store';
import { frequencies, flatEq, getHeadroom, presets, presetNotes } from './model';
import { ProfileDialog } from '@/features/profiles/profile-dialog';
import { useNativeAudio } from '@/features/system-audio/store';

function EqualizerPanel({ standalone = false }: { standalone?: boolean }) {
  const systemActive = useNativeAudio((state) => state.state?.active === true);
  const eq = useApp((state) => state.eq);
  const setEq = useApp((state) => state.setEq);
  const setBand = useApp((state) => state.setBand);
  const [saveOpen, setSaveOpen] = useState(false);
  const active = useMemo(
    () =>
      Object.entries(presets).find(([, bands]) =>
        bands.every((value, index) => value === eq.bands[index]),
      )?.[0] ?? 'Custom',
    [eq.bands],
  );
  const audioAvailable = typeof AudioContext !== 'undefined' || systemActive;
  const headroom = useMemo(() => -20 * Math.log10(getHeadroom(eq)), [eq]);
  const changeBand = useCallback(
    (index: number, value: number) => setBand(index, value),
    [setBand],
  );
  return (
    <section
      className={`equalizer-panel panel ${standalone ? 'standalone' : ''}`}
      aria-labelledby="eq-heading"
    >
      <SectionBar id="eq-heading" icon={SlidersHorizontal} title="Equalizer">
        <div className="eq-toggle">
          <label htmlFor="eq-enabled">{eq.enabled ? 'Enabled' : 'Bypassed'}</label>
          <Switch
            id="eq-enabled"
            checked={eq.enabled}
            disabled={!audioAvailable}
            onCheckedChange={(enabled) => setEq({ ...eq, enabled })}
          />
        </div>
      </SectionBar>
      {!audioAvailable && (
        <p className="inline-error">
          Audio processing is unavailable. You can still save settings.
        </p>
      )}
      <div className="preset-toolbar">
        <label htmlFor="preset">Sound preset</label>
        <Select
          value={active}
          onValueChange={(value) => {
            const bands = presets[value];
            if (bands) setEq({ ...eq, bands: [...bands] });
          }}
        >
          <SelectTrigger id="preset" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {active === 'Custom' && (
              <SelectItem value="Custom" disabled>
                Custom
              </SelectItem>
            )}
            {Object.keys(presets).map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => setEq({ ...flatEq, enabled: eq.enabled })}>
          <RotateCcw />
          Reset
        </Button>
      </div>
      <p className="fine-print" aria-live="polite">
        {presetNotes[active] ?? 'Adjust a preset to taste and save your own.'} Presets are starting
        points, not measured corrections for any specific headset.
      </p>
      <div className={`eq-console ${eq.enabled ? '' : 'bypassed'}`}>
        <div className="gain-scale" aria-hidden="true">
          <span>+12</span>
          <span>0 dB</span>
          <span>−12</span>
        </div>
        <div className="eq-bands">
          {frequencies.map((frequency, index) => (
            <EqBand
              key={frequency}
              index={index}
              frequency={frequency}
              gain={eq.bands[index] ?? 0}
              disabled={!eq.enabled || !audioAvailable}
              onChange={changeBand}
            />
          ))}
        </div>
      </div>
      <div className="eq-foot">
        <span>
          {headroom > 0
            ? `${headroom.toFixed(1)} dB automatic headroom`
            : 'Unity gain · no boost compensation'}
          <span className="headroom-hint">Boosts lower output gain.</span>
        </span>
        <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
          <Save />
          Save profile
        </Button>
      </div>
      <ProfileDialog open={saveOpen} onOpenChange={setSaveOpen} />
    </section>
  );
}

export const Equalizer = memo(EqualizerPanel);

const EqBand = memo(function EqBand({
  index,
  frequency,
  gain,
  disabled,
  onChange,
}: {
  index: number;
  frequency: number;
  gain: number;
  disabled: boolean;
  onChange: (index: number, value: number) => void;
}) {
  const label = frequency >= 1000 ? `${frequency / 1000}k` : `${frequency}`;
  return (
    <div className="eq-band">
      <output aria-hidden="true">
        {gain > 0 ? '+' : ''}
        {gain}
      </output>
      <Slider
        orientation="vertical"
        min={-12}
        max={12}
        step={0.5}
        value={[gain]}
        disabled={disabled}
        aria-label={`${frequency} Hz gain`}
        aria-valuetext={`${gain} decibels`}
        onValueChange={(values) => {
          const value = values[0];
          if (value !== undefined) onChange(index, value);
        }}
      />
      <span>
        {label}
        <span className="sr-only"> Hz</span>
      </span>
    </div>
  );
});
