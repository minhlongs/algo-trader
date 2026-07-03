/**
 * Dark/light mode toggle for the dashboard.
 * Toggles `dark` class on <html>, persists preference to localStorage.
 */
import { useEffect, useState } from 'react';
import { Sun, Moon } from '@phosphor-icons/react';

export function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('theme');
    if (stored) return stored === 'dark';
    return true; // default to dark mode
  });

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <button
      onClick={() => setDark(!dark)}
      className="p-2 text-muted hover:text-white rounded-lg hover:bg-bg-border transition-colors min-h-touch min-w-touch flex items-center justify-center"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
