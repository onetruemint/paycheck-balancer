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
    try {
      const res = await api.listSnapshots({ limit: PAGE, before: nextBefore });
      setSnapshots((prev) => [...(prev ?? []), ...res.snapshots]);
      setNextBefore(res.next_before ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  if (error && !snapshots) return <p className="center-stack muted">Couldn't load history: {error}</p>;
  if (!snapshots) return <Spinner />;

  return (
    <section>
      <h1 className="page-title">History</h1>
      {snapshots.length === 0 ? (
        <p className="muted">No snapshots yet. Your first one is saved when you open Home.</p>
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
        <button className="button button-ghost load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load older'}
        </button>
      )}
    </section>
  );
}
