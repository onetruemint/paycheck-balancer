import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'statemint.theme';

// index.html applies the initial class before first paint; this just reads it back.
function current(): Theme {
  return document.documentElement.classList.contains('theme-dark') ? 'dark' : 'light';
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(current);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('theme-dark', theme === 'dark');
    root.classList.toggle('theme-light', theme === 'light');
    localStorage.setItem(KEY, theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#292929' : '#78e6c3');
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return [theme, toggle];
}
