import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

const WHEEL_COMMIT_DELAY = 200;

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
  const track = useRef<HTMLDivElement>(null);
  const wheelTimer = useRef<number | undefined>(undefined);
  const wheelFrame = useRef<number | undefined>(undefined);
  const wheelValue = useRef(value);
  const shown = draft ?? value;
  useEffect(() => {
    wheelValue.current = shown;
  }, [shown]);
  useEffect(() => {
    const element = track.current;
    if (!element || disabled) return;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      const next = Math.min(100, Math.max(0, wheelValue.current - Math.sign(event.deltaY)));
      wheelValue.current = next;
      if (wheelFrame.current === undefined) {
        wheelFrame.current = window.requestAnimationFrame(() => {
          wheelFrame.current = undefined;
          setDraft(wheelValue.current);
        });
      }
      window.clearTimeout(wheelTimer.current);
      wheelTimer.current = window.setTimeout(() => {
        void commit(wheelValue.current).finally(() => setDraft(null));
      }, WHEEL_COMMIT_DELAY);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [disabled, commit]);
  useEffect(
    () => () => {
      window.clearTimeout(wheelTimer.current);
      window.cancelAnimationFrame(wheelFrame.current ?? 0);
    },
    [],
  );
  return (
    <div className="level-control">
      <span className="level-title">
        <Icon aria-hidden="true" />
        {label}
      </span>
      <div className="level-track" ref={track}>
        <output>{shown}%</output>
        <Slider
          aria-label={label}
          min={0}
          max={100}
          step={1}
          value={[shown]}
          disabled={disabled}
          onValueChange={(values) => setDraft(values[0] ?? null)}
          onValueCommit={(values) => {
            const next = values[0];
            if (next === undefined) return;
            void commit(next).finally(() => setDraft(null));
          }}
        />
      </div>
    </div>
  );
}
