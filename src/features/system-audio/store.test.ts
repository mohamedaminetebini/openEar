import { afterEach, expect, it, vi } from 'vitest';
import {
  disposeDesktopAudio,
  useNativeAudio,
  initializeDesktopAudio,
  nativeOperation,
} from './store';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { nativeCommandSchema } from './schema';

afterEach(() => {
  disposeDesktopAudio();
  clearMocks();
  vi.unstubAllGlobals();
});
it('automatically connects through desktop IPC and applies EQ without an HTTP request or token', async () => {
  vi.stubGlobal('isTauri', true);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const state = {
    outputs: [{ id: 'output', name: 'Output', receiver: false, transport: 'other' }],
    active: false,
    target: null,
    eq: { enabled: true, bands: Array<number>(10).fill(0) },
    receiver: null,
    pairedDevices: [],
    usbDevice: null,
    error: null,
  };
  const commands: string[] = [];
  mockIPC((command, args) => {
    commands.push(command);
    if (command === 'audio_command') {
      if (!args || !('input' in args)) throw new Error('Missing command payload');
      const input = nativeCommandSchema.parse(args?.input);
      if (input.operation === 'start') state.active = true;
      if (input.operation === 'eq') state.eq = input.eq;
    }
    return state;
  });
  await Promise.all([initializeDesktopAudio(), initializeDesktopAudio()]);
  expect(commands).toEqual(['audio_state']);
  expect(useNativeAudio.getState().paired).toBe(true);
  await nativeOperation({ operation: 'start', target: 'output', eq: state.eq });
  await nativeOperation({
    operation: 'eq',
    eq: { enabled: true, bands: Array<number>(10).fill(-2) },
  });
  expect(useNativeAudio.getState().state?.eq.bands[0]).toBe(-2);
  expect(fetch).not.toHaveBeenCalled();
});
it('rejects browser execution without making a network request', async () => {
  vi.stubGlobal('isTauri', false);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await initializeDesktopAudio();
  expect(useNativeAudio.getState().error).toContain('desktop application menu');
  expect(fetch).not.toHaveBeenCalled();
});
it('reports invalid native responses without exposing their contents', async () => {
  vi.stubGlobal('isTauri', true);
  mockIPC(() => ({ private: 'secret' }));
  await initializeDesktopAudio();
  expect(useNativeAudio.getState().error).toContain('incompatible');
  expect(useNativeAudio.getState().paired).toBe(false);
});

it('sends output volume without toggling the panel-wide busy state', async () => {
  vi.stubGlobal('isTauri', true);
  const base = {
    outputs: [{ id: 'output', name: 'Output', receiver: false, transport: 'other', volume: 40 }],
    active: false,
    target: null,
    eq: { enabled: true, bands: Array<number>(10).fill(0) },
    receiver: null,
    pairedDevices: [],
    usbDevice: null,
    error: null,
  };
  const busyValues: boolean[] = [];
  const unsubscribe = useNativeAudio.subscribe((store) => busyValues.push(store.busy));
  mockIPC((command, payload) => {
    if (command === 'audio_state') return base;
    const input = (payload as { input: unknown }).input;
    expect(nativeCommandSchema.safeParse(input).success).toBe(true);
    return { ...base, outputs: [{ ...base.outputs[0], volume: 55 }] };
  });
  await initializeDesktopAudio();
  busyValues.length = 0;
  await nativeOperation({ operation: 'outputVolume', output: 'output', value: 55 });
  unsubscribe();
  expect(busyValues.includes(true)).toBe(false);
  expect(useNativeAudio.getState().state?.outputs[0]?.volume).toBe(55);
});
it('keeps the selected headset when desktop EQ turns off', async () => {
  vi.stubGlobal('isTauri', true);
  const eq = { enabled: true, bands: Array<number>(10).fill(0) };
  const outputs = [
    { id: 'headset', name: 'Headset', receiver: false, transport: 'bluetooth' as const },
    { id: 'speaker', name: 'Speakers', receiver: false, transport: 'other' as const },
  ];
  const base = {
    outputs,
    active: false,
    target: null,
    defaultOutput: 'speaker',
    eq,
    receiver: null,
    pairedDevices: [],
    usbDevice: null,
    error: null,
  };
  let current: object = base;
  mockIPC((command, args) => {
    if (command === 'audio_command' && args && 'input' in args) {
      const input = nativeCommandSchema.parse(args.input);
      if (input.operation === 'start')
        current = { ...base, active: true, target: 'headset', defaultOutput: 'openear.system-eq' };
      if (input.operation === 'stop')
        current = { ...base, active: false, target: null, defaultOutput: 'speaker' };
    }
    return current;
  });
  await initializeDesktopAudio();
  useNativeAudio.setState({ selectedOutput: 'headset' });
  await nativeOperation({ operation: 'start', target: 'headset', eq });
  expect(useNativeAudio.getState().selectedOutput).toBe('headset');
  await nativeOperation({ operation: 'stop' });
  expect(useNativeAudio.getState().selectedOutput).toBe('headset');
});
