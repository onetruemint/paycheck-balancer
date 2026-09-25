import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  type Account,
  type AccountRole,
  type Institution,
  type InstitutionStatus,
  type ManualCard,
  type ManualCardInput,
} from '../api';
import { Spinner } from '../components/Spinner';
import { centsToInput, money, parseMoney, shortDate } from '../format';
import { startLink, type LinkOutcome } from '../link';

const ROLES: { value: AccountRole; label: string }[] = [
  { value: 'paycheck', label: 'Paycheck' },
  { value: 'payment', label: 'Payment' },
  { value: 'target', label: 'Target' },
  { value: 'card', label: 'Card' },
  { value: 'ignored', label: 'Ignored' },
];

const INSTITUTION_STATUS: Record<InstitutionStatus, { label: string; tone: string }> = {
  healthy: { label: 'Connected', tone: 'neutral' },
  needs_reconnect: { label: 'Needs reconnect', tone: 'warning' },
  error: { label: 'Error', tone: 'danger' },
};

interface Props {
  linkState: LinkOutcome | 'completing' | null;
  onRetryLink: () => void;
}

export function Accounts({ linkState, onRetryLink }: Props) {
  const [institutions, setInstitutions] = useState<Institution[] | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [cards, setCards] = useState<ManualCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [linking, setLinking] = useState<string | null>(null);
  const completingLink = linkState === 'completing';

  // Reloads after a link attempt settles, since it may have added or repaired an Item.
  useEffect(() => {
    if (completingLink) return;
    let cancelled = false; // ignore responses from a superseded load
    Promise.all([api.listInstitutions(), api.listAccounts(), api.listManualCards()])
      .then(([i, a, c]) => {
        if (cancelled) return;
        setInstitutions(i);
        setAccounts(a);
        setCards(c);
        setLoadError(null);
      })
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [completingLink, loadAttempt]);

  const retryLoad = () => {
    setLoadError(null);
    setLoadAttempt((n) => n + 1);
  };

  const link = async (mode: 'new' | 'update', institutionId?: string) => {
    setLinking(institutionId ?? 'new');
    setError(null);
    try {
      await startLink(mode, institutionId);
    } catch (e) {
      setError(`Couldn't start Plaid Link: ${(e as Error).message}`);
      setLinking(null);
    }
  };

  const patchAccount = async (id: string, update: Partial<Account>) => {
    const previous = accounts?.find((a) => a.id === id);
    setError(null);
    setAccounts((prev) => prev?.map((a) => (a.id === id ? { ...a, ...update } : a)) ?? null);
    try {
      const saved = await api.updateAccount(id, {
        role: update.role,
        target_balance_cents: update.target_balance_cents,
      });
      setAccounts((prev) => prev?.map((a) => (a.id === id ? saved : a)) ?? null);
    } catch (e) {
      // Roll back the optimistic update.
      if (previous) setAccounts((prev) => prev?.map((a) => (a.id === id ? previous : a)) ?? null);
      setError(`Couldn't save ${previous?.name ?? 'account'}: ${(e as Error).message}`);
    }
  };

  if (completingLink) return <Spinner label="Finishing account link" />;
  if (!institutions || !accounts || !cards) {
    if (!loadError) return <Spinner />;
    return (
      <section className="center-stack">
        {linkState && <LinkBanner state={linkState} onRetry={onRetryLink} />}
        <p className="muted">Couldn't load accounts.</p>
        <p className="small muted">{loadError}</p>
        <button className="button" onClick={retryLoad}>
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="settings">
      <h1 className="page-title">Accounts &amp; Settings</h1>

      {linkState && <LinkBanner state={linkState} onRetry={onRetryLink} />}
      {error && <p className="notice notice-danger">{error}</p>}

      <div className="card">
        <div className="section-head">
          <h2>Institutions</h2>
          <button className="button button-primary" onClick={() => link('new')} disabled={!!linking}>
            {linking === 'new' ? 'Opening…' : 'Link account'}
          </button>
        </div>
        {institutions.length === 0 ? (
          <p className="muted">Nothing linked yet.</p>
        ) : (
          <ul className="rows">
            {institutions.map((inst) => {
              const s = INSTITUTION_STATUS[inst.status];
              return (
                <li key={inst.id} className="row">
                  <div className="row-main">
                    <span className="row-title">{inst.name}</span>
                    {inst.status_detail && <span className="small muted">{inst.status_detail}</span>}
                  </div>
                  <span className={`chip chip-${s.tone}`}>{s.label}</span>
                  {inst.status !== 'healthy' && (
                    <button
                      className="button button-small"
                      onClick={() => link('update', inst.id)}
                      disabled={!!linking}
                    >
                      {linking === inst.id ? 'Opening…' : 'Reconnect'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Linked accounts</h2>
        {accounts.length === 0 ? (
          <p className="muted">Link an institution to see its accounts.</p>
        ) : (
          <ul className="rows">
            {accounts.map((a) => (
              <AccountRow key={a.id} account={a} onChange={(u) => patchAccount(a.id, u)} />
            ))}
          </ul>
        )}
      </div>

      {loadError && (
        <p className="notice notice-danger">
          Couldn't refresh accounts: {loadError}{' '}
          <button className="link-button" onClick={retryLoad}>
            Retry
          </button>
        </p>
      )}

      <ManualCards cards={cards} accounts={accounts} onChange={setCards} onError={setError} />
    </section>
  );
}

function LinkBanner({ state, onRetry }: { state: LinkOutcome; onRetry: () => void }) {
  const retry = (
    <button className="link-button" onClick={onRetry}>
      Retry
    </button>
  );
  if (state.kind === 'no_session') {
    return (
      <p className="notice notice-warning">
        Returned from Plaid, but no link session was found on this device. Please link again.
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p className="notice notice-danger">
        Couldn't finish linking: {state.message} {retry}
      </p>
    );
  }
  const { result } = state;
  if (result.status === 'success') {
    return (
      <p className="notice">
        {result.institution ? `${result.institution.name} linked.` : 'Account linked.'} Set each
        account's role below.
      </p>
    );
  }
  if (result.status === 'exited') {
    return <p className="notice notice-warning">Linking was cancelled.</p>;
  }
  return <p className="notice notice-warning">Plaid hasn't finished that session yet. {retry}</p>;
}

function accountLabel(a: Account) {
  return `${a.name}${a.mask ? ` ••${a.mask}` : ''}`;
}

function AccountRow({ account, onChange }: { account: Account; onChange: (u: Partial<Account>) => void }) {
  const [target, setTarget] = useState(centsToInput(account.target_balance_cents));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => setTarget(centsToInput(account.target_balance_cents)), [account.target_balance_cents]);

  const commitTarget = () => {
    const cents = target.trim() === '' ? null : parseMoney(target);
    const bad = target.trim() !== '' && cents === null;
    setInvalid(bad);
    if (!bad && cents !== account.target_balance_cents) onChange({ target_balance_cents: cents });
  };

  const selectId = `role-${account.id}`;
  return (
    <li className="row row-wrap">
      <div className="row-main">
        <span className="row-title">{accountLabel(account)}</span>
        <span className="small muted">
          {account.institution_name} · {money(account.current_balance_cents)}
        </span>
      </div>
      <label className="visually-hidden" htmlFor={selectId}>
        Role for {account.name}
      </label>
      <select
        id={selectId}
        className="select"
        value={account.role}
        onChange={(e) => onChange({ role: e.target.value as AccountRole })}
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {account.role === 'target' && (
        <label className="inline-field">
          <span>Target balance</span>
          <input
            className={`input${invalid ? ' input-invalid' : ''}`}
            inputMode="decimal"
            placeholder="0.00"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onBlur={commitTarget}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
      )}
    </li>
  );
}

// ---------- Manual cards ----------

interface ManualCardsProps {
  cards: ManualCard[];
  accounts: Account[];
  onChange: (cards: ManualCard[]) => void;
  onError: (msg: string) => void;
}

function ManualCards({ cards, accounts, onChange, onError }: ManualCardsProps) {
  const [editing, setEditing] = useState<ManualCard | 'new' | null>(null);
  const byId = new Map(accounts.map((a) => [a.id, a]));

  // Errors propagate to the form, which shows them inline.
  const save = async (input: ManualCardInput) => {
    if (editing === 'new') {
      const created = await api.createManualCard(input);
      onChange([...cards, created]);
    } else if (editing) {
      const updated = await api.updateManualCard(editing.id, input);
      onChange(cards.map((c) => (c.id === updated.id ? updated : c)));
    }
    setEditing(null);
  };

  const remove = async (card: ManualCard) => {
    if (!confirm(`Delete ${card.name}?`)) return;
    try {
      await api.deleteManualCard(card.id);
      onChange(cards.filter((c) => c.id !== card.id));
    } catch (e) {
      onError(`Couldn't delete card: ${(e as Error).message}`);
    }
  };

  return (
    <div className="card">
      <div className="section-head">
        <h2>Manual cards</h2>
        {editing === null && (
          <button className="button" onClick={() => setEditing('new')}>
            Add card
          </button>
        )}
      </div>
      {editing === 'new' && (
        <ManualCardForm accounts={accounts} onSave={save} onCancel={() => setEditing(null)} />
      )}
      {cards.length === 0 && editing !== 'new' && <p className="muted">No manual cards.</p>}
      <ul className="rows">
        {cards.map((c) => {
          const linked = c.linked_account_id ? byId.get(c.linked_account_id) : undefined;
          return editing !== 'new' && editing?.id === c.id ? (
            <li key={c.id} className="row-form">
              <ManualCardForm initial={c} accounts={accounts} onSave={save} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={c.id} className="row row-wrap">
              <div className="row-main">
                <span className="row-title">
                  {c.name} {c.paid && <span className="chip chip-neutral">Paid</span>}
                </span>
                <span className="small muted">
                  {money(c.statement_balance_cents)} · due {shortDate(c.due_date)}
                  {linked && (
                    <>
                      {' '}
                      · {accountLabel(linked)} ({money(linked.current_balance_cents)})
                    </>
                  )}
                </span>
              </div>
              <div className="row-actions">
                <button className="button button-small" onClick={() => setEditing(c)}>
                  Edit
                </button>
                <button className="button button-small button-ghost" onClick={() => remove(c)}>
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface FormProps {
  initial?: ManualCard;
  accounts: Account[];
  onSave: (input: ManualCardInput) => Promise<void>;
  onCancel: () => void;
}

function ManualCardForm({ initial, accounts, onSave, onCancel }: FormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [balance, setBalance] = useState(centsToInput(initial?.statement_balance_cents ?? null));
  const [statementDate, setStatementDate] = useState(initial?.statement_date ?? '');
  const [dueDate, setDueDate] = useState(initial?.due_date ?? '');
  const [statementDay, setStatementDay] = useState(initial?.statement_day?.toString() ?? '');
  const [paid, setPaid] = useState(initial?.paid ?? false);
  const [linkedId, setLinkedId] = useState(initial?.linked_account_id ?? '');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const linked = accounts.find((a) => a.id === linkedId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cents = parseMoney(balance);
    const day = statementDay === '' ? null : Number(statementDay);
    if (!name.trim()) return setProblem('Name is required.');
    if (cents === null) return setProblem('Statement balance must be an amount like 123.45.');
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31))
      return setProblem('Statement day must be 1–31.');
    setProblem(null);
    setSaving(true);
    try {
      await onSave({
      name: name.trim(),
      statement_balance_cents: cents,
      statement_date: statementDate || null,
      due_date: dueDate || null,
      statement_day: day,
      paid,
      linked_account_id: linkedId || null,
      });
    } catch (err) {
      setProblem(`Couldn't save card: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <div className="field-grid">
        <label className="field">
          <span>Statement balance</span>
          <input
            className="input"
            inputMode="decimal"
            placeholder="0.00"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Statement day</span>
          <input
            className="input"
            type="number"
            min={1}
            max={31}
            value={statementDay}
            onChange={(e) => setStatementDay(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Statement date</span>
          <input
            className="input"
            type="date"
            value={statementDate}
            onChange={(e) => setStatementDate(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Due date</span>
          <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Linked account (optional)</span>
        <select className="select" value={linkedId} onChange={(e) => setLinkedId(e.target.value)}>
          <option value="">None</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {accountLabel(a)}
            </option>
          ))}
        </select>
        {linked && <span className="small muted">Current balance: {money(linked.current_balance_cents)}</span>}
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
        <span>Paid</span>
      </label>
      {problem && <p className="notice notice-danger">{problem}</p>}
      <div className="form-actions">
        <button type="button" className="button button-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
