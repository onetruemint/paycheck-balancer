# StateMint — Frontend Requirements

**Status:** Draft 1 · Handoff to Claude Code worker agent
**Context:** Local-only rebuild of the Paycheck Transfer Calculator. No cloud, no auth, no push notifications, no automated detection. User is notified of payday by their own bank; opening the app triggers everything else.

---

## 1. Stack

| Layer | Choice |
|---|---|
| Framework | React + Vite |
| Styling | Plain CSS with custom properties (light/dark = two variable sets swapped on a root class). No Tailwind, no CSS Modules. |
| Font | Roboto via Google Fonts CDN |
| Auth | None — LAN-only access, no login screen, no session handling |
| Backend | Existing local API (Plaid interface), running on homelab |
| Storage | Postgres, single table (see §7) |
| Install | PWA — manifest + icon, standalone display, "Add to Home Screen" |

## 2. App identity

- **Name:** StateMint
- **Icon:** none designed yet — generate a simple placeholder (mint-colored glyph) if none is supplied

## 3. Screens

1. **Home** — current month's snapshot + refresh
2. **History** — past monthly snapshots
3. **Accounts/Settings** — linked institutions, roles, targets, manual cards

## 4. Navigation

- **Drawer** (hamburger icon), not a bottom tab bar
- **Top bar**, fixed on every screen: drawer icon (left) + light/dark toggle icon (right)

## 5. Theming

| Token | Value |
|---|---|
| Mint | `#78e6c3` |
| Black | `#292929` |

- Toggle is a button, not system-preference-only
- Mint/black are the base palette; a small semantic set (red = overdue, amber = partially paid) is layered on top, used sparingly, only for status indicators
- Rounded corners
- Slight shadow (flat-with-borders is not the direction — cards should have subtle elevation)

## 6. Home screen

**Layout:** number-first.
- Transfer amount is large, at the top
- Per-card / per-target breakdown is collapsed below it, tap to expand

**On open:**
1. Query local API/DB for current month's snapshot
2. If it exists → display it, no recompute
3. If not → fetch transactions/balances/liabilities, auto-pick the largest deposit in the paycheck account in the last 3–5 days as the paycheck amount, run the calculation, display it, and store it (see §7 for the write rule)
4. No user interaction required to reach a displayed number

**Refresh button:**
- Re-runs the exact same on-open logic above (does not force an overwrite of an existing snapshot) — behaves like reloading the page without reloading the page

**Per-item failure handling:**
- If a card/Item fails to fetch, that row shows "Data unavailable" — the rest of the totals still render (no whole-screen error state)

**Loading state:** minimal spinner

**Empty state (no accounts linked yet):** "Link account to get started" button → Accounts/Settings

## 7. History screen

- List of monthly snapshots, **newest first**
- Each row: month, transfer amount, date computed — collapsed
- Tap a row to expand into the full card-by-card breakdown (same interaction pattern as Home)

## 8. Accounts/Settings screen

Denser and more form-heavy than Home is acceptable — this screen is visited rarely, not on every open. Inputs should still be kept minimal (no unnecessary fields), but this screen is not held to Home's minimalism otherwise.

**Linked accounts:**
- Dropdown per account, inline: role = Paycheck / Payment / Target / Card / Ignored
- When role = Target, show a target balance input on that row

**Manual cards (full CRUD):**
- Fields: name, statement balance, statement date, due date, statement day, paid flag, optional linked Plaid account
- Linked-account field shows that account's current balance when set

**Linked institutions:**
- List with status
- **Reconnect** button on any institution needing it

**Linking / reconnecting (Plaid Hosted Link):**
- Initiate via `/link/token/create` (new mode for linking, update mode for reconnect)
- On redirect back to the app, the app calls the local API, which checks the Hosted Link session status and completes the token exchange **synchronously** — no webhook, no async wait
- No Item slot counter (warn/refuse) and no duplicate-institution guard — not needed for a single manual user

## 9. Data model

Single Postgres table:

```sql
CREATE TABLE monthly_snapshot (
    month_key   TEXT PRIMARY KEY,        -- '2026-09'
    computed_at TIMESTAMPTZ NOT NULL,
    paycheck_amount_cents INTEGER NOT NULL,
    transfer_cents INTEGER NOT NULL,
    detail      JSONB NOT NULL           -- per-card/target owed, funded, statement balance, due date, status
);
```

Write rule — atomic, no read-then-write race:

```sql
INSERT INTO monthly_snapshot (month_key, computed_at, paycheck_amount_cents, transfer_cents, detail)
VALUES ($1, now(), $2, $3, $4)
ON CONFLICT (month_key) DO NOTHING;
```

Read on open / refresh:

```sql
SELECT * FROM monthly_snapshot WHERE month_key = $1;
```

## 10. Responsive scope

- Mobile-first, phone width is the primary target
- Reasonable, basically-scaled layout on desktop — no dedicated desktop layout, no extra breakpoints beyond making it not break

## 11. Explicitly out of scope (dropped from the original cloud spec)

- Push notifications and delivery tracking
- Automated paycheck detection, learned pay schedule, missed-paycheck alerts
- Webhook receiver (Plaid webhooks) — replaced by query-on-open
- Manual card monthly reminder
- Item slot counter / duplicate-link guard
- Login / auth (Cognito, passkeys, JWT sessions)
- CloudWatch alarms, failure emails
- Update-push-on-late-statement logic — a fresh query just reflects current data

## 12. Calculation logic (unchanged from original spec)

The funding-order and statement-status rules (owed/funded per card, due-date-first funding, target top-ups) are unchanged from `requirements.md` §6.3–6.4. This document only covers what changed: presentation, triggering, storage, and everything cut above.
