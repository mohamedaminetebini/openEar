import { expect, it } from 'vitest';
import { nativeCommandSchema } from './schema';

it('accepts noise-mode reads and writes for a headset address only', () => {
  expect(
    nativeCommandSchema.safeParse({
      operation: 'noise',
      address: 'D8:99:86:61:F9:92',
      mode: 'transparency',
    }).success,
  ).toBe(true);
  expect(
    nativeCommandSchema.safeParse({ operation: 'noise', address: 'D8:99:86:61:F9:92', mode: null })
      .success,
  ).toBe(true);
  expect(
    nativeCommandSchema.safeParse({ operation: 'noise', address: 'not-an-address', mode: null })
      .success,
  ).toBe(false);
  expect(
    nativeCommandSchema.safeParse({
      operation: 'noise',
      address: 'D8:99:86:61:F9:92',
      mode: 'adaptive',
    }).success,
  ).toBe(false);
});

it('accepts output volume changes between 0 and 100', () => {
  expect(
    nativeCommandSchema.safeParse({ operation: 'outputVolume', output: 'sink', value: 40 }).success,
  ).toBe(true);
  expect(
    nativeCommandSchema.safeParse({ operation: 'outputVolume', output: 'sink', value: 101 })
      .success,
  ).toBe(false);
});
