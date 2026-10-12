import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Volume2 } from 'lucide-react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { LevelSlider } from './level-slider';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

describe('LevelSlider', () => {
  it('steps the value with the mouse wheel and commits it once', async () => {
    const commit = vi.fn(async () => true);
    const { container } = render(
      <LevelSlider
        label="Output volume"
        icon={Volume2}
        value={50}
        disabled={false}
        commit={commit}
      />,
    );
    const track = container.querySelector('.level-track') as HTMLElement;
    fireEvent.wheel(track, { deltaY: -100 });
    fireEvent.wheel(track, { deltaY: -100 });
    expect(await screen.findByText('52%')).toBeInTheDocument();
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    expect(commit).toHaveBeenCalledWith(52);
  });

  it('ignores the wheel while disabled', () => {
    const commit = vi.fn(async () => true);
    const { container } = render(
      <LevelSlider label="Output volume" icon={Volume2} value={50} disabled commit={commit} />,
    );
    fireEvent.wheel(container.querySelector('.level-track') as HTMLElement, { deltaY: -100 });
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(commit).not.toHaveBeenCalled();
  });
});
