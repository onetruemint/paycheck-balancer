import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { isMock } from './api';
import { Drawer } from './components/Drawer';
import { MenuIcon, MoonIcon, SunIcon } from './components/Icons';
import { completePendingLink, type LinkOutcome } from './link';
import { useRoute } from './router';
import { Accounts } from './screens/Accounts';
import { History } from './screens/History';
import { Home } from './screens/Home';
import { useTheme } from './theme';

// Hash routing owns location.hash, so the skip link moves focus instead of navigating.
function skipToMain(e: MouseEvent) {
  e.preventDefault();
  document.getElementById('main')?.focus();
}

export function App({ linkReturn }: { linkReturn: boolean }) {
  const route = useRoute();
  const [theme, toggleTheme] = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const [linkState, setLinkState] = useState<LinkOutcome | 'completing' | null>(
    linkReturn ? 'completing' : null,
  );
  const retryLink = useCallback(() => setLinkState('completing'), []);
  const menuButton = useRef<HTMLButtonElement>(null);

  // Returning from Plaid Hosted Link: complete the session before showing Accounts.
  useEffect(() => {
    if (linkState !== 'completing') return;
    completePendingLink().then(setLinkState);
  }, [linkState]);

  return (
    <>
      <a className="skip-link" href="#main" onClick={skipToMain}>
        Skip to content
      </a>
      <header className="topbar">
        <button
          ref={menuButton}
          className="icon-button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-controls="drawer"
        >
          <MenuIcon />
        </button>
        <span className="topbar-title" translate="no">
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
      <Drawer open={drawerOpen} route={route} onClose={closeDrawer} returnFocusTo={menuButton} />
      <main id="main" className="content" tabIndex={-1}>
        {route === 'home' && <Home />}
        {route === 'history' && <History />}
        {route === 'accounts' && <Accounts linkState={linkState} onRetryLink={retryLink} />}
      </main>
    </>
  );
}
