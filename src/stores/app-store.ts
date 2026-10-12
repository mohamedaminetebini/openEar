import { create } from 'zustand';
import { z } from 'zod';
import { database } from '@/lib/db/database';
import { eqSchema, flatEq, type EqSettings } from '@/features/equalizer/model';
import { AudioEngine } from '@/features/audio/engine';
import { applySystemEq, runOperation, useNativeAudio } from '@/features/system-audio/store';
import { deviceKey, deviceSoundsSchema, type DeviceSound } from '@/features/devices/device-sound';
import type { NativeState } from '@/features/system-audio/schema';

export const audioEngine = new AudioEngine();
const preferencesSchema = z.object({
  eq: eqSchema,
  lastProfile: z.string().nullable(),
  deviceSounds: deviceSoundsSchema.default({}),
});
type Preferences = z.infer<typeof preferencesSchema>;
interface AppState extends Preferences {
  hydrated: boolean;
  persistenceError: string | null;
  setEq: (settings: EqSettings) => void;
  setBand: (index: number, gain: number) => void;
  setLastProfile: (id: string | null) => void;
}
let revision = 0;
let nativeTimer: ReturnType<typeof setTimeout> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let writes: Promise<unknown> = Promise.resolve();
function persist() {
  ++revision;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const state = useApp.getState();
    const value: Preferences = {
      eq: state.eq,
      lastProfile: state.lastProfile,
      deviceSounds: state.deviceSounds,
    };
    writes = writes
      .catch(() => {})
      .then(() => database.settings.put({ key: 'preferences', value }))
      .then(
        () => useApp.setState({ persistenceError: null }),
        () =>
          useApp.setState({
            persistenceError:
              'Local storage is unavailable. Changes work for this session but could not be saved.',
          }),
      );
  }, 150);
}
export const useApp = create<AppState>((set, get) => ({
  eq: flatEq,
  lastProfile: null,
  deviceSounds: {},
  hydrated: false,
  persistenceError: null,
  setEq: (input) => {
    const eq = eqSchema.parse(input);
    audioEngine.setEq(useNativeAudio.getState().state?.active ? { ...eq, enabled: false } : eq);
    const output = activeOutput();
    if (output) {
      const key = deviceKey(output);
      const deviceSounds = get().deviceSounds;
      set({
        eq,
        lastProfile: null,
        deviceSounds: {
          ...deviceSounds,
          [key]: { correction: null, bass: 0, treble: 0, ...deviceSounds[key], eq },
        },
      });
    } else {
      set({ eq, lastProfile: null });
    }
    clearTimeout(nativeTimer);
    nativeTimer = setTimeout(() => {
      void applySystemEq(useApp.getState().eq).catch(() => {});
    }, 200);
    persist();
  },
  setBand: (index, gain) => {
    if (!Number.isInteger(index) || index < 0 || index >= 10) return;
    get().setEq({
      ...get().eq,
      bands: get().eq.bands.map((value, position) => (position === index ? gain : value)),
    });
  },
  setLastProfile: (lastProfile) => {
    set({ lastProfile });
    persist();
  },
}));
export function outputById(id: string | null): NativeState['outputs'][number] | undefined {
  return useNativeAudio.getState().state?.outputs.find((output) => output.id === id);
}
export function soundFor(output: NativeState['outputs'][number]): EqSettings {
  const { deviceSounds, eq } = useApp.getState();
  return deviceSounds[deviceKey(output)]?.eq ?? eq;
}
export function activeOutput() {
  const state = useNativeAudio.getState().state;
  return state?.active ? outputById(state.target) : undefined;
}
export async function applyCorrection(name: string, source: string, bands: number[]) {
  const output = activeOutput() ?? outputById(useNativeAudio.getState().selectedOutput);
  if (!output) return;
  const key = deviceKey(output);
  const existing: DeviceSound = useApp.getState().deviceSounds[key] ?? {
    eq: flatEq,
    correction: null,
    bass: 0,
    treble: 0,
  };
  const eq: EqSettings = { enabled: true, bands: [...bands], shape: 'peaking' };
  useApp.setState((state) => ({
    deviceSounds: {
      ...state.deviceSounds,
      [key]: { ...existing, correction: { name, source, bands }, eq },
    },
  }));
  persist();
  if (activeOutput()) useApp.getState().setEq(eq);
  else await runOperation({ operation: 'start', target: output.id, eq });
}
let presentHeadphones = new Set<string>();
function checkHeadphones() {
  if (!useApp.getState().hydrated) return;
  const snapshot = useNativeAudio.getState().state;
  if (!snapshot) return;
  const headphones = snapshot.outputs.filter(
    (output) => output.transport === 'usb' || output.transport === 'bluetooth',
  );
  const current = new Set(headphones.map((output) => output.id));
  const fresh = headphones.find((output) => !presentHeadphones.has(output.id));
  presentHeadphones = current;
  if (fresh && !snapshot.active)
    void runOperation({ operation: 'start', target: fresh.id, eq: soundFor(fresh) });
}
const removeHeadphoneSubscription = useNativeAudio.subscribe(checkHeadphones);
const removeHydrationSubscription = useApp.subscribe((state, previous) => {
  if (state.hydrated && !previous.hydrated) checkHeadphones();
});
const removeNativeSubscription = useNativeAudio.subscribe((state, previous) => {
  const native = state.state;
  const switched =
    native?.active === true && (!previous.state?.active || native.target !== previous.state.target);
  if (native && switched) useApp.getState().setEq(native.eq);
  const eq = useApp.getState().eq;
  audioEngine.setEq(native?.active ? { ...eq, enabled: false } : eq);
});
export async function applySavedEq(eq: EqSettings) {
  clearTimeout(nativeTimer);
  await applySystemEq(eq);
  useApp.getState().setEq(eq);
}
let hydration: Promise<void> | null = null;
export function hydrateSettings(): Promise<void> {
  if (hydration) return hydration;
  const startRevision = revision;
  hydration = (async () => {
    try {
      const saved = await database.settings.get('preferences');
      if (saved && revision === startRevision) {
        const valid = preferencesSchema.parse(saved.value);
        useApp.setState(valid);
        audioEngine.setEq(valid.eq);
      }
    } catch {
      useApp.setState({
        persistenceError:
          'Saved settings could not be loaded. Current changes will stay local to this session until storage is available.',
      });
    } finally {
      useApp.setState({ hydrated: true });
    }
  })();
  return hydration;
}
export const usePlayback = create<{ playback: AudioEngine['state'] }>(() => ({
  playback: audioEngine.state,
}));
audioEngine.subscribe(() => usePlayback.setState({ playback: audioEngine.state }));
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    clearTimeout(timer);
    clearTimeout(nativeTimer);
    removeNativeSubscription();
    removeHeadphoneSubscription();
    removeHydrationSubscription();
    void audioEngine.dispose();
  });
