import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { applyCorrection } from '@/stores/app-store';
import { loadCorrections, type CorrectionEntry } from './index';

const POPULAR_MODELS = [
  'Sony WH-1000XM5',
  'Sennheiser Momentum 4',
  'Sennheiser HD 600',
  'Beyerdynamic DT 770 Pro',
  'Audio-Technica ATH-M50x',
  'Apple AirPods Pro',
  'Bose QuietComfort 45',
];

function popularEntries(entries: CorrectionEntry[]) {
  return POPULAR_MODELS.flatMap((name) => {
    const entry = entries.find(([model]) => model.toLowerCase().startsWith(name.toLowerCase()));
    return entry ? [entry] : [];
  });
}

export function CorrectionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<CorrectionEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open || entries || failed) return;
    loadCorrections().then(setEntries, () => setFailed(true));
  }, [open, entries, failed]);
  const term = query.trim().toLowerCase();
  const searching = term.length >= 2;
  const matches =
    searching && entries
      ? entries.filter(([model]) => model.toLowerCase().includes(term)).slice(0, 50)
      : [];
  const shown = searching ? matches : entries ? popularEntries(entries) : [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Find headphones</DialogTitle>
        </DialogHeader>
        <Input
          type="search"
          placeholder="Search models"
          aria-label="Search models"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {failed && <p className="inline-error">Headphone list unavailable.</p>}
        {!searching && shown.length > 0 && <p className="subtle-label">Popular</p>}
        <ul className="paired-list">
          {shown.map(([model, source, type, bands]) => (
            <li key={`${source}/${type}/${model}`}>
              <div className="correction-text">
                <span>{model}</span>
                <span>
                  {source} · {type}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void applyCorrection(model, source, bands);
                  onOpenChange(false);
                }}
              >
                Apply
              </Button>
            </li>
          ))}
        </ul>
        {term.length >= 2 && entries && matches.length === 0 && (
          <p className="empty-copy">No models match “{query.trim()}”.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
