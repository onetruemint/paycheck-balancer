import type { ItemStatus, SnapshotItem } from '../api';
import { money, shortDate } from '../format';

const STATUS_LABEL: Record<ItemStatus, string> = {
  paid: 'Paid',
  partially_paid: 'Partially Paid',
  due: 'Due',
  overdue: 'Overdue',
  no_statement: 'No Statement',
  at_target: 'At Target',
  below_target: 'Below Target',
};

// Semantic colours are reserved for these two; everything else stays neutral.
const STATUS_TONE: Partial<Record<ItemStatus, string>> = {
  overdue: 'danger',
  partially_paid: 'warning',
};

export function StatusChip({ status }: { status: ItemStatus }) {
  return <span className={`chip chip-${STATUS_TONE[status] ?? 'neutral'}`}>{STATUS_LABEL[status]}</span>;
}

function ItemRow({ item }: { item: SnapshotItem }) {
  const title = (
    <div className="item-title">
      <span className="item-name">{item.name}</span>
      <span className="item-sub">
        {[item.institution_name, item.mask && `••${item.mask}`].filter(Boolean).join(' ')}
      </span>
    </div>
  );

  if (item.error) {
    return (
      <li className="item item-error">
        <div className="item-head">
          {title}
          <span className="item-unavailable">Data unavailable</span>
        </div>
        <p className="item-meta">
          {item.error.message}
          {item.error.institution_id && (
            <>
              {' '}
              <a className="link-button" href="#/accounts">
                Reconnect
              </a>
            </>
          )}
        </p>
      </li>
    );
  }

  const facts: [string, string][] =
    item.kind === 'target'
      ? [
          ['Needed', money(item.owed_cents)],
          ['Balance', money(item.current_balance_cents)],
          ['Target', money(item.target_balance_cents)],
        ]
      : [
          ['Owed', money(item.owed_cents)],
          ['Statement', money(item.statement_balance_cents)],
          ['Due', shortDate(item.due_date)],
        ];

  return (
    <li className="item">
      <div className="item-head">
        {title}
        <div className="item-amount">
          <span className="item-funded">{money(item.funded_cents)}</span>
          <span className="item-funded-label">funded</span>
        </div>
      </div>
      <div className="item-foot">
        {item.status && <StatusChip status={item.status} />}
        <dl className="item-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </li>
  );
}

export function Breakdown({ items }: { items: SnapshotItem[] }) {
  if (items.length === 0) return <p className="muted">No cards or targets in this snapshot.</p>;
  return (
    <ul className="items">
      {items.map((item) => (
        <ItemRow key={`${item.kind}:${item.id}`} item={item} />
      ))}
    </ul>
  );
}
