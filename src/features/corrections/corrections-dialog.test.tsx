import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CorrectionsDialog } from './corrections-dialog';
import type { CorrectionEntry } from './index';

const bands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const entries: CorrectionEntry[] = [
  ['Sony WH-1000XM5', 'Super Review', 'over-ear', bands],
  ['Sennheiser HD 600', 'oratory1990', 'over-ear', bands],
  ['Test Model One', 'oratory1990', 'over-ear', bands],
];

vi.mock('./index', () => ({ loadCorrections: vi.fn(async () => entries) }));
vi.mock('@/stores/app-store', () => ({ applyCorrection: vi.fn() }));

describe('CorrectionsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('suggests popular models until the search has two characters', async () => {
    render(<CorrectionsDialog open onOpenChange={() => {}} />);
    expect(await screen.findByText('Sony WH-1000XM5')).toBeInTheDocument();
    expect(screen.getByText('Popular')).toBeInTheDocument();
    expect(screen.queryByText('Test Model One')).not.toBeInTheDocument();
  });

  it('replaces the suggestions with search results', async () => {
    render(<CorrectionsDialog open onOpenChange={() => {}} />);
    await screen.findByText('Sony WH-1000XM5');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search models' }), 'test');
    expect(screen.queryByText('Popular')).not.toBeInTheDocument();
    expect(screen.queryByText('Sony WH-1000XM5')).not.toBeInTheDocument();
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
  });
});
