import { StrictMode } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { Providers } from './app/providers/providers';
import { ErrorBoundary } from './app/error-boundary';
import './styles.css';
import { initializeDesktopAudio } from './features/system-audio/store';
import { applyTheme, readTheme } from './features/settings/theme';
applyTheme(readTheme());
void initializeDesktopAudio();

const root = document.getElementById('root');
if (!root) throw new Error('The application root is missing.');
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <Providers>
        <>
          {isTauri() ? (
            <App />
          ) : (
            <main className="desktop-required">
              <h1>Openear is a desktop app</h1>
              <p>Launch Openear from your application menu to control your audio.</p>
            </main>
          )}
        </>
      </Providers>
    </ErrorBoundary>
  </StrictMode>,
);
