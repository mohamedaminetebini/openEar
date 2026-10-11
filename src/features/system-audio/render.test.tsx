import { Profiler } from 'react';
import { render, act } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SystemAudioPanel } from './system-audio';
import { useNativeAudio } from './store';
import { useApp } from '@/stores/app-store';
import type { NativeState } from './schema';

const state: NativeState = {
  outputs: [
    { id: 'speaker', name: 'Desktop speakers', receiver: false, transport: 'other' },
    { id: 'headset', name: 'Headset', receiver: false, transport: 'bluetooth' },
  ],
  active: false,
  target: null,
  defaultOutput: null,
  pairedDevices: [],
  eq: { enabled: true, bands: Array<number>(10).fill(0) },
  receiver: null,
  usbDevice: null,
  error: null,
};

it('does not re-render the output panel when an EQ band changes', () => {
  useNativeAudio.setState({
    paired: true,
    state,
    selectedOutput: 'speaker',
    error: null,
    busy: false,
  });
  const onRender = vi.fn();
  render(
    <Profiler id="output" onRender={onRender}>
      <SystemAudioPanel />
    </Profiler>,
  );
  onRender.mockClear();
  act(() => useApp.getState().setBand(0, 3));
  expect(onRender).not.toHaveBeenCalled();
});
