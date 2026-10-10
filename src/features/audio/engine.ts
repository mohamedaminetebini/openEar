import { flatEq, type EqSettings } from '@/features/equalizer/model';
import { createEqualizerGraph } from './graph';

export interface PlaybackState {
  name: string | null;
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  error: string | null;
}
export class AudioEngine {
  state: PlaybackState = {
    name: null,
    playing: false,
    position: 0,
    duration: 0,
    volume: 0.7,
    error: null,
  };
  private listeners = new Set<() => void>();
  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private graph: ReturnType<typeof createEqualizerGraph> | null = null;
  private url: string | null = null;
  private settings: EqSettings = flatEq;
  private generation = 0;
  private removeEvents: (() => void) | null = null;
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private publish(patch: Partial<PlaybackState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  load(file: File) {
    if (file.size === 0 || file.size > 250 * 1024 * 1024)
      throw new Error('Choose a nonempty audio file smaller than 250 MB.');
    if (file.type && !file.type.startsWith('audio/') && !file.type.startsWith('video/'))
      throw new Error('Choose a supported audio file.');
    ++this.generation;
    if (!this.audio) {
      this.audio = new Audio();
      const audio = this.audio;
      audio.preload = 'metadata';
      audio.volume = this.state.volume;
      const sync = () =>
        this.publish({
          playing: !audio.paused,
          position: audio.currentTime,
          duration: Number.isFinite(audio.duration) ? audio.duration : 0,
        });
      const fail = () =>
        this.publish({
          error: 'This file could not be decoded. Try WAV, MP3, or another supported audio format.',
          playing: false,
        });
      ['timeupdate', 'loadedmetadata', 'play', 'pause', 'ended'].forEach((event) =>
        audio.addEventListener(event, sync),
      );
      audio.addEventListener('error', fail);
      this.removeEvents = () => {
        ['timeupdate', 'loadedmetadata', 'play', 'pause', 'ended'].forEach((event) =>
          audio.removeEventListener(event, sync),
        );
        audio.removeEventListener('error', fail);
      };
    }
    this.audio.pause();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(file);
    this.audio.src = this.url;
    this.audio.load();
    this.publish({ name: file.name, playing: false, position: 0, duration: 0, error: null });
  }
  async play() {
    if (!this.audio || !this.state.name) throw new Error('Choose an audio file first.');
    const audio = this.audio;
    const generation = this.generation;
    if (!this.context) {
      this.context = new AudioContext();
      this.graph = createEqualizerGraph(this.context, this.context.createMediaElementSource(audio));
      this.graph.update(this.settings);
    }
    await this.context.resume();
    if (generation !== this.generation) return;
    try {
      await audio.play();
      this.publish({ error: null });
    } catch {
      this.publish({
        error: 'Playback could not start. Try a supported file and press Play again.',
        playing: false,
      });
    }
  }
  pause() {
    this.audio?.pause();
  }
  setEq(settings: EqSettings) {
    this.settings = settings;
    this.graph?.update(settings);
  }
  setVolume(volume: number) {
    const value = Math.max(0, Math.min(1, volume));
    if (this.audio) this.audio.volume = value;
    this.publish({ volume: value });
  }
  seek(position: number) {
    if (this.audio && Number.isFinite(position))
      this.audio.currentTime = Math.max(0, Math.min(this.state.duration, position));
  }
  async dispose() {
    ++this.generation;
    this.removeEvents?.();
    this.removeEvents = null;
    this.audio?.pause();
    this.audio?.removeAttribute('src');
    this.audio?.load();
    this.audio = null;
    this.graph?.dispose();
    this.graph = null;
    const context = this.context;
    this.context = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    if (context && context.state !== 'closed') await context.close();
    this.publish({ name: null, playing: false, position: 0, duration: 0 });
  }
}
