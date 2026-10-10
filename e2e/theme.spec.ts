import { expect, test } from '@playwright/test';
import { installDesktop } from './desktop-fixture';

test('dark mode switch in the header applies the theme and survives a reload', async ({ page }) => {
  await installDesktop(page);
  await page.goto('/');
  const darkMode = page.getByRole('switch', { name: 'Dark mode', exact: true });
  await expect(darkMode).toHaveAttribute('aria-checked', 'false');
  await darkMode.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
