import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <button
      className="icon-button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Use light theme' : 'Use dark theme'}
      title={dark ? 'Use light theme' : 'Use dark theme'}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
