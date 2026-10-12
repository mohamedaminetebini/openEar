import type { Page } from '@playwright/test';
import type { NativeState, NativeCommand } from '../src/features/system-audio/schema';
export async function installDesktop(page: Page, receiver = true) {
  const state: NativeState = {
    outputs: [
      { id: 'receiver', name: 'USB audio', receiver: true, transport: 'usb', volume: 80 },
      { id: 'speaker', name: 'Desktop speakers', receiver: false, transport: 'other' },
    ],
    active: false,
    target: null,
    defaultOutput: null,
    pairedDevices: [{ address: '77:35:D9:7D:14:7B', name: 'Test headset' }],
    eq: { enabled: true, bands: Array<number>(10).fill(0) },
    receiver: receiver
      ? { volume: 60, mute: false, micGain: 20, micMute: false, autoGain: true }
      : null,
    usbDevice: receiver
      ? {
          vendorId: '3206',
          productId: '0881',
          manufacturer: 'OEM',
          product: 'USB Audio',
          revision: '0100',
        }
      : null,
    error: null,
  };
  if (!receiver) state.outputs = state.outputs.filter((output) => !output.receiver);
  await page.route('**/corrections/index.json', (route) =>
    route.fulfill({
      json: {
        commit: 'test',
        entries: [
          [
            'Test Model One',
            'testsource',
            'over-ear',
            [6.6, 4.6, -0.4, -1.9, -0.1, -0.1, 3.9, -1.4, -2.7, -7.5],
          ],
          ['Another Model', 'testsource', 'in-ear', Array<number>(10).fill(0)],
        ],
      },
    }),
  );
  await page.addInitScript((snapshot) => {
    let failure: string | null = null;
    window.addEventListener('fixture-state', (event) => {
      if (!(event instanceof CustomEvent)) return;
      Object.assign(snapshot, event.detail);
    });
    window.addEventListener('fixture-failure', (event) => {
      if (event instanceof CustomEvent) failure = event.detail;
    });
    Object.defineProperty(window, 'isTauri', { value: true });
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        invoke: async (command: string, args?: { input?: NativeCommand }) => {
          if (command === 'audio_state') return structuredClone(snapshot);
          if (failure) throw new Error(failure);
          if (command !== 'audio_command' || !args?.input)
            throw new Error('Unexpected native command');
          const input = args.input;
          switch (input.operation) {
            case 'start':
              snapshot.active = true;
              snapshot.target = input.target;
              snapshot.eq = input.eq;
              break;
            case 'eq':
              snapshot.eq = input.eq;
              break;
            case 'stop':
              snapshot.active = false;
              snapshot.target = null;
              break;
            case 'volume':
              if (snapshot.receiver) snapshot.receiver.volume = input.value;
              break;
            case 'micGain':
              if (snapshot.receiver) snapshot.receiver.micGain = input.value;
              break;
            case 'mute':
              if (snapshot.receiver) snapshot.receiver.mute = input.value;
              break;
            case 'micMute':
              if (snapshot.receiver) snapshot.receiver.micMute = input.value;
              break;
            case 'connect':
              snapshot.pairedDevices = snapshot.pairedDevices.filter(
                (device) => device.address !== input.address,
              );
              break;
            case 'autoGain':
              if (snapshot.receiver) snapshot.receiver.autoGain = input.value;
              break;
          }
          return structuredClone(snapshot);
        },
      },
    });
  }, state);
}
