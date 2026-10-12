import { expect, it } from 'vitest';
import { parseFixedBandEq } from './parse';

const gains = [6.6, 4.6, -0.4, -1.9, -0.1, -0.1, 3.9, -1.4, -2.7, -7.5];
const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const filters = (list: number[] = gains, frequency = frequencies, count = list.length) =>
  list
    .slice(0, count)
    .map(
      (gain, index) =>
        `Filter ${index + 1}: ON PK Fc ${frequency[index]} Hz Gain ${gain} dB Q 1.41`,
    )
    .join('\n');

it('parses a fixed-band AutoEq file', () => {
  expect(parseFixedBandEq(`Preamp: -7.5 dB\n${filters()}\n`)).toEqual({
    bands: gains,
    clamped: false,
  });
});
it('rejects files without exactly ten filters', () => {
  expect(parseFixedBandEq(`Preamp: -7.5 dB\n${filters(gains, frequencies, 9)}`)).toBeNull();
});
it('rejects files with the wrong frequency grid', () => {
  const shifted = [32, ...frequencies.slice(1)];
  expect(parseFixedBandEq(filters(gains, shifted))).toBeNull();
});
it('clamps gains to ±12 and reports it', () => {
  const result = parseFixedBandEq(filters([14.2, ...gains.slice(1)]));
  expect(result?.bands[0]).toBe(12);
  expect(result?.clamped).toBe(true);
});
