import { useEffect, useRef, type RefObject } from 'react';
import { isMock } from '../api';
import { MOCK_SCENARIOS, getMockScenario, setMockScenario } from '../api/mock';
import { type Route } from '../router';
import { CloseIcon } from './Icons';

const LINKS: { route: Route; href: string; label: string }[] = [
  { route: 'home', href: '#/', label: 'Home' },
  { route: 'history', href: '#/history', label: 'History' },
  { route: 'accounts', href: '#/accounts', label: 'Accounts & Settings' },
];

interface Props {
  open: boolean;
  route: Route;
  onClose: () => void;
  /** Element to refocus when the drawer closes (the menu button). */
  returnFocusTo: RefObject<HTMLElement | null>;
}

export function Drawer({ open, route, onClose, returnFocusTo }: Props) {
  const nav = useRef<HTMLElement>(null);

  // Move focus into the drawer when it opens; hand it back to the trigger when it closes.
  useEffect(() => {
    if (open) {
      nav.current?.querySelector<HTMLElement>('[aria-current="page"], a')?.focus();
    } else if (nav.current?.contains(document.activeElement)) {
      returnFocusTo.current?.focus();
    }
  }, [open, returnFocusTo]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div className={`scrim${open ? ' scrim-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <nav
        ref={nav}
        id="drawer"
        className={`drawer${open ? ' drawer-open' : ''}`}
        aria-label="Main"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="drawer-head">
          <span className="brand" translate="no">
            <img src="/icon.svg" alt="" width="28" height="28" />
            StateMint
          </span>
          <button className="icon-button" onClick={onClose} aria-label="Close menu">
            <CloseIcon />
          </button>
        </div>
        <ul className="drawer-links">
          {LINKS.map((l) => (
            <li key={l.route}>
              <a
                href={l.href}
                className={`drawer-link${route === l.route ? ' drawer-link-active' : ''}`}
                aria-current={route === l.route ? 'page' : undefined}
                onClick={onClose}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        {isMock && (
          <label className="mock-picker">
            <span>Mock scenario</span>
            <select
              defaultValue={getMockScenario()}
              onChange={(e) => {
                setMockScenario(e.target.value as (typeof MOCK_SCENARIOS)[number]);
                // Drop any ?mock= / hash so the stored choice wins on reload.
                location.replace(location.pathname);
              }}
            >
              {MOCK_SCENARIOS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </nav>
    </>
  );
}
