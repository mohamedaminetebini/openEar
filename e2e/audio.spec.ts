import { expect, test } from '@playwright/test';
import { installDesktop } from './desktop-fixture';
test.beforeEach(async ({ page }) => {
  await installDesktop(page, false);
});

test('the production EQ graph changes actual rendered PCM, and bypass restores flat gain', async ({
  page,
}) => {
  await page.goto('/');
  const result: { flat: number; cut: number; bypass: number } = await page.evaluate(async () => {
    const path = '/src/features/audio/graph.ts';
    const module = await import(path);
    async function rms(enabled: boolean, gain: number): Promise<number> {
      const context = new OfflineAudioContext(1, 44100, 44100);
      const oscillator = context.createOscillator();
      oscillator.frequency.value = 1000;
      const graph = module.createEqualizerGraph(context, oscillator);
      graph.update({ enabled, bands: [0, 0, 0, 0, 0, gain, 0, 0, 0, 0] });
      oscillator.start();
      const samples = (await context.startRendering()).getChannelData(0).slice(22050);
      graph.dispose();
      return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    }
    return { flat: await rms(true, 0), cut: await rms(true, -12), bypass: await rms(false, -12) };
  });
  expect(result.flat).toBeCloseTo(Math.SQRT1_2, 3);
  expect(result.cut).toBeLessThan(result.flat * 0.3);
  expect(result.bypass).toBeCloseTo(result.flat, 4);
});
