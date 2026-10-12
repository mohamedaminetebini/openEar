import { expect, test } from '@playwright/test';
import { installDesktop } from './desktop-fixture';

test('desktop-only launch guard offers no browser hardware or token controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Openear is a desktop app' })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
});
test('paired headsets that are not connected can be connected from the output panel', async ({
  page,
}) => {
  await installDesktop(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect headset' }).click();
  await expect(page.getByRole('dialog', { name: 'Connect a headset' })).toBeVisible();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Connect headset' })).toHaveCount(0);
});
test('recognized receiver uses the bundled official logo and switches themes with the selected output', async ({
  page,
}) => {
  await installDesktop(page);
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Redragon', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-manufacturer', 'redragon');
  await expect(page.getByLabel('Listen through')).toHaveValue('receiver');
  await page.getByLabel('Listen through').selectOption('speaker');
  await expect(page.locator('html')).toHaveAttribute('data-manufacturer', 'neutral');
  await expect(page.getByRole('img', { name: 'Redragon' })).toHaveCount(0);
  await page.getByLabel('Listen through').selectOption('receiver');
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('fixture-state', {
        detail: {
          usbDevice: null,
          receiver: null,
          outputs: [
            { id: 'speaker', name: 'Desktop speakers', receiver: false, transport: 'other' },
          ],
        },
      }),
    ),
  );
  await expect(page.locator('html')).toHaveAttribute('data-manufacturer', 'neutral');
  await expect(page.getByLabel('Listen through')).toHaveValue('speaker');
});
test('starts desktop EQ on a detected headphone, applies live presets, saves and reapplies a profile', async ({
  page,
}) => {
  await installDesktop(page);
  await page.goto('/');
  let networkRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes(':4318/')) ++networkRequests;
  });
  await expect(page.getByText('Desktop EQ active', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Listen through')).toBeEnabled();
  await page.getByRole('combobox', { name: 'Sound preset' }).click();
  await page.getByRole('option', { name: 'Treble soften', exact: true }).click();
  await expect(page.getByRole('slider', { name: '8000 Hz gain', exact: true })).toHaveAttribute(
    'aria-valuenow',
    '-3',
  );
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await page.getByLabel('Profile name').fill('Evening');
  await page.getByRole('dialog').getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('button', { name: 'Profiles', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evening', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^(Apply|Applied)$/ }).click();
  await expect(page.getByText('Applied Evening.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Profiles', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evening', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^(Apply|Applied)$/ }).click();
  await page.getByRole('button', { name: 'Sound', exact: true }).click();
  await expect(page.getByRole('slider', { name: '8000 Hz gain', exact: true })).toHaveAttribute(
    'aria-valuenow',
    '-3',
  );
  await page.getByRole('button', { name: 'Turn off desktop EQ', exact: true }).click();
  await expect(page.getByText('Desktop EQ off', { exact: true })).toBeVisible();
  expect(networkRequests).toBe(0);
});
test('receiver commands report failure and keep the slider for retry', async ({ page }) => {
  await installDesktop(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Device', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Receiver playback volume' });
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('fixture-failure', { detail: 'Receiver unavailable' })),
  );
  await slider.press('End');
  await expect(page.getByRole('alert')).toContainText('Audio is unavailable');
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('fixture-failure', { detail: null })),
  );
  await slider.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', '100');
});
test('profiles can be renamed, updated, duplicated, preferred and deleted', async ({ page }) => {
  await installDesktop(page, false);
  await page.goto('/');
  await page.getByRole('button', { name: 'Profiles', exact: true }).click();
  await page.getByRole('button', { name: 'New profile' }).click();
  await page.getByLabel('Profile name').fill('Focus');
  await page.getByRole('dialog').getByRole('button', { name: 'Save profile' }).click();
  await page.getByRole('button', { name: 'Rename profile' }).click();
  await page.getByLabel('Profile name').fill('Focus work');
  await page.getByRole('button', { name: 'Save name' }).click();
  await page.getByRole('button', { name: 'Update profile from current EQ' }).click();
  await page.getByRole('button', { name: 'Duplicate profile' }).click();
  await expect(page.getByRole('heading', { name: 'Focus work copy', exact: true })).toBeVisible();
  const original = page
    .locator('.profile-row')
    .filter({ has: page.locator('h3').filter({ hasText: /^Focus work$/ }) });
  await original.getByRole('button', { name: 'Set preferred profile' }).click();
  await expect(original.getByLabel('Preferred profile', { exact: true })).toBeVisible();
  await original.getByRole('button', { name: 'Delete profile', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete profile', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Focus work', exact: true })).toHaveCount(0);
});
test('minimum window keeps controls visible and keyboard EQ usable', async ({ page }) => {
  await installDesktop(page);
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/');
  await page.getByRole('slider', { name: '1000 Hz gain', exact: true }).press('End');
  await expect(page.getByRole('slider', { name: '1000 Hz gain', exact: true })).toHaveAttribute(
    'aria-valuenow',
    '12',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('remembers the EQ for each output', async ({ page }) => {
  await installDesktop(page);
  await page.goto('/');
  await expect(page.getByText('Desktop EQ active', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Sound preset' }).click();
  await page.getByRole('option', { name: 'Bass boost', exact: true }).click();
  await expect(page.getByRole('slider', { name: '31 Hz gain' })).toHaveAttribute(
    'aria-valuenow',
    '6',
  );
  await page.getByLabel('Listen through').selectOption('speaker');
  await expect(page.getByLabel('Listen through')).toHaveValue('speaker');
  await page.getByRole('combobox', { name: 'Sound preset' }).click();
  await page.getByRole('option', { name: 'Vocal', exact: true }).click();
  await expect(page.getByRole('slider', { name: '31 Hz gain' })).toHaveAttribute(
    'aria-valuenow',
    '-2',
  );
  await page.getByLabel('Listen through').selectOption('receiver');
  await expect(page.getByRole('slider', { name: '31 Hz gain' })).toHaveAttribute(
    'aria-valuenow',
    '6',
  );
  await page.getByLabel('Listen through').selectOption('speaker');
  await expect(page.getByRole('slider', { name: '31 Hz gain' })).toHaveAttribute(
    'aria-valuenow',
    '-2',
  );
});
test('applies a headphone correction', async ({ page }) => {
  await installDesktop(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Find headphones' }).click();
  await page.getByRole('searchbox', { name: 'Search models' }).fill('test mod');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('slider', { name: '31 Hz gain' })).toHaveAttribute(
    'aria-valuenow',
    '6.6',
  );
  await expect(page.getByRole('combobox', { name: 'Sound preset' })).toHaveText('Test Model One');
  await page.getByRole('combobox', { name: 'Sound preset' }).click();
  await page.getByRole('option', { name: 'Flat', exact: true }).click();
  await expect(page.getByRole('slider', { name: '31 Hz gain' })).toHaveAttribute(
    'aria-valuenow',
    '0',
  );
  await expect(page.getByRole('combobox', { name: 'Sound preset' })).toHaveText('Flat');
});
