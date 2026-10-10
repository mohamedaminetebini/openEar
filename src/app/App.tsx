import { lazy, memo, Suspense, useEffect, useState } from 'react';
import { Headphones, SlidersHorizontal, Bookmark, Settings2, Cable } from 'lucide-react';
import { Equalizer } from '@/features/equalizer/equalizer';
import { ProfilesPanel } from '@/features/profiles/profiles-panel';
import { SystemAudioPanel } from '@/features/system-audio/system-audio';
import { useNativeAudio } from '@/features/system-audio/store';
import { DeviceOverview } from '@/features/devices/components/device-overview';
import { manufacturerForOutput } from '@/features/devices/manufacturer';
import { useApp } from '@/stores/app-store';
import { ThemeSwitch } from '@/features/settings/theme-switch';
const Settings = lazy(async () => ({
  default: (await import('@/features/settings/settings')).Settings,
}));
type Page = 'sound' | 'device' | 'profiles' | 'settings';
const navigation = [
  { id: 'sound', label: 'Sound', icon: SlidersHorizontal },
  { id: 'device', label: 'Device', icon: Cable },
  { id: 'profiles', label: 'Profiles', icon: Bookmark },
  { id: 'settings', label: 'Settings', icon: Settings2 },
] satisfies { id: Page; label: string; icon: typeof Headphones }[];
const descriptions: Record<Page, string> = {
  sound: 'Shape the sound of your output.',
  device: 'Playback and microphone for your receiver.',
  profiles: 'Save EQ settings and reuse them anytime.',
  settings: 'Preferences, device details, and diagnostics.',
};
export function App() {
  const [page, setPage] = useState<Page>('sound');
  const state = useNativeAudio((store) => store.state);
  const selected = useNativeAudio((store) => store.selectedOutput);
  const error = useNativeAudio((store) => store.error);
  const brand = manufacturerForOutput(error ? null : state, selected);
  const output = state?.outputs.find((item) => item.id === selected);
  const persistenceError = useApp((store) => store.persistenceError);
  const hydrated = useApp((store) => store.hydrated);
  useEffect(() => {
    document.documentElement.dataset.manufacturer = brand.id;
  }, [brand.id]);
  return (
    <div className="app-shell" data-manufacturer={brand.id}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="app-sidebar">
        <div className="app-identity">
          <Headphones />
          <span>Openear</span>
        </div>
        <div className="manufacturer-identity">
          {brand.logo ? (
            <img src={brand.logo} alt="Redragon" width="128" height="76" />
          ) : (
            <Headphones aria-hidden="true" className="neutral-logo" />
          )}
          <strong>{brand.model ? `${brand.name} ${brand.model}` : 'Your audio'}</strong>
          <span>
            {brand.model
              ? 'USB receiver detected'
              : output
                ? 'Audio output selected'
                : 'Waiting for an audio output'}
          </span>
        </div>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <NavButton key={item.id} item={item} current={page === item.id} onSelect={setPage} />
          ))}
        </nav>
      </aside>
      <div className="app-workspace">
        <header className="workspace-header">
          <span>{brand.model ? `${brand.name} ${brand.model}` : 'Openear desktop'}</span>
          <div className="header-actions">
            <ThemeSwitch />
            <span className={`processing-status ${state?.active ? 'active' : ''}`} role="status">
              {state?.active ? 'Desktop EQ active' : 'Desktop EQ off'}
            </span>
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          <div className="page-heading">
            <h1>{navigation.find((item) => item.id === page)?.label}</h1>
            <p>{descriptions[page]}</p>
          </div>
          {persistenceError && (
            <p role="alert" className="inline-error">
              {persistenceError}
            </p>
          )}
          {!hydrated ? (
            <p role="status">Loading your saved settings…</p>
          ) : (
            <div key={page} className="page-view">
              <Suspense fallback={<p role="status">Loading…</p>}>
                {page === 'sound' && (
                  <>
                    <SystemAudioPanel />
                    <Equalizer standalone />
                  </>
                )}
                {page === 'device' && (
                  <>
                    <DeviceOverview />
                    <SystemAudioPanel controls />
                  </>
                )}
                {page === 'profiles' && <ProfilesPanel />}
                {page === 'settings' && <Settings />}
              </Suspense>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const NavButton = memo(function NavButton({
  item,
  current,
  onSelect,
}: {
  item: (typeof navigation)[number];
  current: boolean;
  onSelect: (page: Page) => void;
}) {
  return (
    <button aria-current={current ? 'page' : undefined} onClick={() => onSelect(item.id)}>
      <item.icon />
      <span>{item.label}</span>
    </button>
  );
});
