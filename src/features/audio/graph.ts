import { eqSchema, frequencies, getHeadroom, type EqSettings } from '@/features/equalizer/model';

function filterType(index: number, shape: 'graphic' | 'peaking' | undefined) {
  if (shape === 'peaking') return 'peaking';
  return index === 0 ? 'lowshelf' : index === frequencies.length - 1 ? 'highshelf' : 'peaking';
}
export function createEqualizerGraph(context: BaseAudioContext, source: AudioNode) {
  const preamp = context.createGain();
  source.connect(preamp);
  const filters = frequencies.map((frequency, index) => {
    const filter = context.createBiquadFilter();
    filter.type = filterType(index, undefined);
    filter.frequency.value = Math.min(frequency, context.sampleRate / 2 - 1);
    filter.Q.value = 1.4;
    return filter;
  });
  let previous: AudioNode = preamp;
  filters.forEach((filter) => {
    previous.connect(filter);
    previous = filter;
  });
  previous.connect(context.destination);
  return {
    update(settings: EqSettings) {
      const valid = eqSchema.parse(settings);
      preamp.gain.setTargetAtTime(getHeadroom(valid), context.currentTime, 0.015);
      filters.forEach((filter, index) => {
        filter.type = filterType(index, valid.shape);
        filter.Q.value = valid.shape === 'peaking' ? 1.41 : 1.4;
        filter.gain.setTargetAtTime(
          valid.enabled ? (valid.bands[index] ?? 0) : 0,
          context.currentTime,
          0.015,
        );
      });
    },
    dispose() {
      source.disconnect();
      preamp.disconnect();
      filters.forEach((filter) => filter.disconnect());
    },
  };
}
