import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { ProfilesPanel } from './profiles-panel';
import { database } from '@/lib/db/database';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useApp } from '@/stores/app-store';

beforeEach(async () => {
  await database.profiles.clear();
  await database.settings.clear();
  useApp.setState({ eq: { enabled: true, bands: Array(10).fill(0) }, lastProfile: null });
});
it('saves user input through the real repository and applies the stored EQ', async () => {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ProfilesPanel />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  await screen.findByText('Keep the settings you love');
  await user.click(screen.getByRole('button', { name: 'New profile' }));
  await user.type(screen.getByLabelText('Profile name'), 'Reading');
  await user.click(screen.getByRole('button', { name: 'Save profile' }));
  await screen.findByRole('heading', { name: 'Reading' });
  expect((await database.profiles.toArray())[0]?.name).toBe('Reading');
  act(() => useApp.getState().setEq({ enabled: true, bands: Array(10).fill(-4) }));
  await user.click(await screen.findByRole('button', { name: 'Apply' }));
  await waitFor(() => expect(useApp.getState().eq.bands).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  expect(
    await screen.findByText('Applied Reading. Turn on desktop EQ to hear it.'),
  ).toBeInTheDocument();
  client.clear();
});
