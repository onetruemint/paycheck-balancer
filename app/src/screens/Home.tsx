import { useCallback, useEffect, useState } from 'react';
import { api, type CurrentSnapshotResponse } from '../api';
import { Breakdown } from '../components/Breakdown';
import { ChevronIcon, RefreshIcon } from '../components/Icons';
import { Spinner } from '../components/Spinner';
import { dateTime, money, monthLabel, shortDate } from '../format';
import { navigate } from '../router';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; data: CurrentSnapshotResponse };

export function Home() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // Same get-or-compute call on open and on Refresh; the server never overwrites
  // an existing month, so Refresh behaves like reloading the page.
  const load = useCallback(async () => {
    try {
      const data = await api.resolveCurrentSnapshot();
      setState({ kind: 'loaded', data });
      setRefreshError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Keep whatever is already on screen; only a first-load failure is full-screen.
      setState((prev) => (prev.kind === 'loaded' ? prev : { kind: 'error', message }));
      setRefreshError(message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    if (state.kind !== 'loaded') setState({ kind: 'loading' });
    await load();
    setRefreshing(false);
  };

  const refreshButton = (
    <button className="button button-ghost" onClick={refresh} disabled={refreshing}>
      <span className={refreshing ? 'spin' : undefined}>
        <RefreshIcon />
      </span>
      {refreshing ? 'Refreshing…' : 'Refresh'}
    </button>
  );

  const refreshNotice = refreshError && (
    <p className="notice notice-danger">Couldn't refresh: {refreshError}</p>
  );

  if (state.kind === 'loading') return <Spinner />;

  if (state.kind === 'error') {
    return (
      <section className="center-stack">
        <p className="muted">Couldn't reach the StateMint server.</p>
        <p className="small muted">{state.message}</p>
        {refreshButton}
      </section>
    );
  }

  const { data } = state;

  if (data.state === 'no_accounts') {
    return (
      <section className="center-stack">
        <h1 className="empty-title">Welcome to StateMint</h1>
        <p className="muted">No accounts are linked yet.</p>
        <button className="button button-primary" onClick={() => navigate('accounts')}>
          Link account to get started
        </button>
        {refreshNotice}
      </section>
    );
  }

  if (data.state === 'no_paycheck') {
    return (
      <section className="center-stack">
        <p className="eyebrow">{monthLabel(data.month_key)}</p>
        <p className="muted">
          {data.message ?? 'No paycheck deposit found yet for this month.'}
        </p>
        {refreshButton}
        {refreshNotice}
      </section>
    );
  }

  const { snapshot, persisted } = data;
  const { items, paycheck } = snapshot.detail;
  const unavailable = items.filter((i) => i.error).length;

  return (
    <section className="home">
      <div className="hero card">
        <p className="eyebrow">Transfer for {monthLabel(snapshot.month_key)}</p>
        <p className="hero-amount">{money(snapshot.transfer_cents)}</p>
        <p className="hero-sub">
          from paycheck of {money(snapshot.paycheck_amount_cents)}
          {paycheck && <> on {shortDate(paycheck.date)}</>}
        </p>
        <div className="hero-actions">
          <span className="small muted">Computed {dateTime(snapshot.computed_at)}</span>
          {refreshButton}
        </div>
        {refreshNotice}
        {/* The server never stores a snapshot with failed items (persisted: false). */}
        {!persisted && (
          <p className="notice">
            Not saved
            {unavailable > 0 && (
              <> — {unavailable} {unavailable === 1 ? 'item was' : 'items were'} unavailable</>
            )}
            . This month's snapshot is only saved once everything loads; tap Refresh or reopen
            the app to try again.
          </p>
        )}
      </div>

      <div className="card collapsible">
        <button
          className="collapsible-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((x) => !x)}
        >
          <span>
            Breakdown <span className="muted">· {items.length} items</span>
            {unavailable > 0 && <span className="chip chip-neutral">{unavailable} unavailable</span>}
          </span>
          <ChevronIcon open={expanded} />
        </button>
        {expanded && <Breakdown items={items} />}
      </div>
    </section>
  );
}
