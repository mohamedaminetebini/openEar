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
