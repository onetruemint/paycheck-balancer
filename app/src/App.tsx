import { useCallback, useEffect, useState } from 'react';
import { isMock, type LinkCompleteResponse } from './api';
import { Drawer } from './components/Drawer';
import { MenuIcon, MoonIcon, SunIcon } from './components/Icons';
import { completePendingLink } from './link';
import { useRoute } from './router';
import { Accounts } from './screens/Accounts';
import { History } from './screens/History';
import { Home } from './screens/Home';
import { useTheme } from './theme';

export function App({ linkReturn }: { linkReturn: boolean }) {
  const route = useRoute();
  const [theme, toggleTheme] = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const [linkResult, setLinkResult] = useState<LinkCompleteResponse | 'completing' | null>(
    linkReturn ? 'completing' : null,
  );

  // Returning from Plaid Hosted Link: complete the session before showing Accounts.
  useEffect(() => {
    if (linkResult !== 'completing') return;
    completePendingLink()
      .then((res) => setLinkResult(res ?? { status: 'pending' }))
      .catch(() => setLinkResult({ status: 'pending' }));
  }, [linkResult]);

  return (
    <>
      <header className="topbar">
        <button className="icon-button" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
          <MenuIcon />
        </button>
        <span className="topbar-title">
          StateMint{isMock && <span className="mock-tag">mock</span>}
        </span>
        <button
          className="icon-button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>
      <Drawer open={drawerOpen} route={route} onClose={closeDrawer} />
      <main className="content">
        {route === 'home' && <Home />}
        {route === 'history' && <History />}
        {route === 'accounts' && <Accounts linkResult={linkResult} />}
      </main>
    </>
  );
}
