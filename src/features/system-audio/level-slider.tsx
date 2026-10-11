import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

export function LevelSlider({
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
  return (
    <div className="level-control">
      <div className="level-head">
        <span className="level-title">
          <Icon aria-hidden="true" />
          {label}
        </span>
        <output>{draft ?? value}%</output>
      </div>
      <Slider
        aria-label={label}
        min={0}
        max={100}
        step={1}
        value={[draft ?? value]}
        disabled={disabled}
        onValueChange={(values) => setDraft(values[0] ?? null)}
        onValueCommit={(values) => {
          const next = values[0];
          if (next === undefined) return;
          void commit(next).finally(() => setDraft(null));
        }}
      />
    </div>
  );
}
