import { useEffect, useState } from 'react';
import { api, type Snapshot } from '../api';
import { Breakdown } from '../components/Breakdown';
import { ChevronIcon } from '../components/Icons';
import { Spinner } from '../components/Spinner';
import { dateTime, money, monthLabel, shortDate } from '../format';

const PAGE = 12;

export function History() {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listSnapshots({ limit: PAGE })
      .then((res) => {
        setSnapshots(res.snapshots);
        setNextBefore(res.next_before ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const loadMore = async () => {
    if (!nextBefore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await api.listSnapshots({ limit: PAGE, before: nextBefore });
      setSnapshots((prev) => [...(prev ?? []), ...res.snapshots]);
      setNextBefore(res.next_before ?? null);
    } catch (e) {
      setLoadMoreError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  if (error && !snapshots) {
    return (
      <section className="center-stack">
        <h1 className="empty-title">Couldn’t load history</h1>
        <p className="muted">Check that the home server is running, then reopen this page.</p>
        <p className="small muted">{error}</p>
      </section>
    );
  }
  if (!snapshots) return <Spinner />;

  return (
    <section>
      <h1 className="page-title">History</h1>
      {snapshots.length === 0 ? (
        <p className="empty-note muted">
          No snapshots yet. Your first one is saved the next time Home loads cleanly.
        </p>
      ) : (
        <ul className="history">
          {snapshots.map((s) => {
            const isOpen = open === s.month_key;
            return (
              <li key={s.month_key} className="card collapsible">
                <button
                  className="collapsible-toggle history-row"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : s.month_key)}
                >
                  <span className="history-main">
                    <span className="history-month">{monthLabel(s.month_key)}</span>
                    <span className="small muted">Computed {dateTime(s.computed_at)}</span>
                  </span>
                  <span className="history-amount">{money(s.transfer_cents)}</span>
                  <ChevronIcon open={isOpen} />
                </button>
                {isOpen && (
                  <>
                    <p className="small muted history-paycheck">
                      Paycheck {money(s.paycheck_amount_cents)}
                      {s.detail.paycheck && <> on {shortDate(s.detail.paycheck.date)}</>}
                    </p>
                    <Breakdown items={s.detail.items} />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {nextBefore && (
        <div className="load-more">
          <button className="button button-ghost" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : loadMoreError ? 'Retry' : 'Load Older'}
          </button>
          {loadMoreError && (
            <p className="small load-more-error" role="alert">
              Couldn’t load older snapshots: {loadMoreError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
