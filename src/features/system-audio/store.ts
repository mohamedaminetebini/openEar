import { create } from 'zustand';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  nativeStateSchema,
  nativeCommandSchema,
  type NativeCommand,
  type NativeState,
} from './schema';
import { sameEq, type EqSettings } from '../equalizer/model';

let generation = 0;
let queue: Promise<unknown> = Promise.resolve();
let polling: ReturnType<typeof setInterval> | null = null;
let pollPending = false;
let operationsPending = 0;
let connection: Promise<void> | null = null;
export const useNativeAudio = create<{
  paired: boolean;
  state: NativeState | null;
  selectedOutput: string | null;
  error: string | null;
  busy: boolean;
}>(() => ({ paired: false, state: null, selectedOutput: null, error: null, busy: false }));

async function request(input?: NativeCommand) {
  if (!isTauri()) throw new Error('Open Openear from your desktop application menu.');
  if (input) nativeCommandSchema.parse(input);
  let result: unknown;
  try {
    result = await invoke(input ? 'audio_command' : 'audio_state', input ? { input } : undefined);
  } catch (error) {
    throw new Error(
      typeof error === 'string' ? error : 'Audio is unavailable. Check your output and retry.',
      { cause: error },
    );
  }
  const state = nativeStateSchema.safeParse(result);
  if (!state.success) throw new Error('The audio response is incompatible. Restart Openear.');
  return state.data;
}
let lastSnapshot = '';
function update(state: NativeState) {
  const serialized = JSON.stringify(state);
  if (serialized === lastSnapshot) return;
  lastSnapshot = serialized;
  const previous = useNativeAudio.getState().state;
  const selected = useNativeAudio.getState().selectedOutput;
  const eqTurnedOff = previous?.active === true && !state.active;
  const defaultChanged =
    previous !== null &&
    !eqTurnedOff &&
    state.defaultOutput !== previous.defaultOutput &&
    state.outputs.some((output) => output.id === state.defaultOutput);
  const selectedOutput = state.active
    ? state.target
    : defaultChanged
      ? state.defaultOutput
      : state.outputs.some((output) => output.id === selected)
        ? selected
        : (state.outputs.find((output) => output.receiver)?.id ?? state.outputs[0]?.id ?? null);
  useNativeAudio.setState({ state, selectedOutput, error: null });
}
export function selectOutput(id: string) {
  const state = useNativeAudio.getState();
  if (state.busy || state.state?.active || !state.state?.outputs.some((output) => output.id === id))
    return;
  useNativeAudio.setState({ selectedOutput: id });
}
export async function runOperation(input: NativeCommand): Promise<boolean> {
  try {
    await nativeOperation(input);
    return true;
  } catch {
    return false;
  }
}
export function initializeDesktopAudio(): Promise<void> {
  if (connection) return connection;
  const current = generation;
  connection = request()
    .then((state) => {
      if (current !== generation) return;
      update(state);
      useNativeAudio.setState({ paired: true });
      if (polling) return;
      polling = setInterval(() => {
        if (pollPending || useNativeAudio.getState().busy) return;
        pollPending = true;
        void request()
          .then(
            (state) => {
              if (current === generation) update(state);
            },
            () => {
              if (current === generation)
                useNativeAudio.setState({
                  error:
                    'Audio devices could not be refreshed. Check your audio service and retry.',
                });
            },
          )
          .finally(() => {
            pollPending = false;
          });
      }, 3000);
    })
    .catch((error: unknown) => {
      if (current === generation)
        useNativeAudio.setState({
          error: error instanceof Error ? error.message : 'Audio is unavailable.',
        });
    })
    .finally(() => {
      connection = null;
    });
  return connection;
}
export function disposeDesktopAudio() {
  ++generation;
  lastSnapshot = '';
  if (polling) clearInterval(polling);
  polling = null;
  useNativeAudio.setState({
    paired: false,
    state: null,
    selectedOutput: null,
    error: null,
    busy: false,
  });
}
export function nativeOperation(input: NativeCommand): Promise<NativeState> {
  const current = generation;
  ++operationsPending;
  const task = queue
    .then(async () => {
      if (current !== generation)
        throw new Error('The audio session changed. Retry the operation.');
      const quiet = input.operation === 'outputVolume';
      if (!quiet) useNativeAudio.setState({ busy: true, error: null });
      try {
        const state = await request(input);
        if (current === generation) update(state);
        return state;
      } catch (error) {
        if (current === generation)
          useNativeAudio.setState({
            error: error instanceof Error ? error.message : 'The audio operation failed.',
          });
        throw error;
      } finally {
        if (current === generation && !quiet) useNativeAudio.setState({ busy: false });
      }
    })
    .finally(() => {
      --operationsPending;
    });
  queue = task.catch(() => {});
  return task;
}
export async function applySystemEq(eq: EqSettings) {
  const state = useNativeAudio.getState().state;
  if (state?.active && (operationsPending > 0 || !sameEq(state.eq, eq)))
    await nativeOperation({ operation: 'eq', eq });
}
if (import.meta.hot) import.meta.hot.dispose(disposeDesktopAudio);
