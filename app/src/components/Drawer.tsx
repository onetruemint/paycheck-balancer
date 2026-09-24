import { useEffect } from 'react';
import { isMock } from '../api';
import { MOCK_SCENARIOS, getMockScenario, setMockScenario } from '../api/mock';
import { navigate, type Route } from '../router';
import { CloseIcon } from './Icons';

const LINKS: { route: Route; label: string }[] = [
  { route: 'home', label: 'Home' },
  { route: 'history', label: 'History' },
  { route: 'accounts', label: 'Accounts & Settings' },
];

interface Props {
  open: boolean;
  route: Route;
  onClose: () => void;
}

export function Drawer({ open, route, onClose }: Props) {
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
        className={`drawer${open ? ' drawer-open' : ''}`}
        aria-label="Main"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="drawer-head">
          <span className="brand">
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
              <button
                className={`drawer-link${route === l.route ? ' drawer-link-active' : ''}`}
                aria-current={route === l.route ? 'page' : undefined}
                onClick={() => {
                  navigate(l.route);
                  onClose();
                }}
              >
                {l.label}
              </button>
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
