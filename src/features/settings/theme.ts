import { create } from 'zustand';

export type Theme = 'light' | 'dark';

const storageKey = 'openear.theme';

export function readTheme(): Theme {
  try {
    return localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    // Storage is unavailable; the theme still applies for this session.
  }
}

export const useTheme = create<{ theme: Theme; setTheme: (theme: Theme) => void }>((set) => ({
  theme: readTheme(),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
}));
