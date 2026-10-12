import { expect, it } from 'vitest';
import { correctionIndexSchema } from './index';

const gains = [6.6, 4.6, -0.4, -1.9, -0.1, -0.1, 3.9, -1.4, -2.7, -7.5];

it('accepts a well-formed correction index', () => {
  expect(
    correctionIndexSchema.safeParse({
      commit: 'abc123',
      entries: [['Test Model One', 'testsource', 'over-ear', gains]],
    }).success,
  ).toBe(true);
});
it('rejects an entry with nine gains', () => {
  expect(
    correctionIndexSchema.safeParse({
      commit: 'abc123',
      entries: [['Short', 'testsource', 'over-ear', gains.slice(0, 9)]],
    }).success,
  ).toBe(false);
});
