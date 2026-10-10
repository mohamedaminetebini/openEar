import { Moon, Sun } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useTheme } from './theme';

export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const Icon = theme === 'dark' ? Moon : Sun;
  return (
    <div className="theme-switch">
      <Icon aria-hidden="true" />
      <Switch
        checked={theme === 'dark'}
        onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
        aria-label="Dark mode"
      />
    </div>
  );
}
