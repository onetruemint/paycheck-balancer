# StateMint (frontend)

React + Vite PWA for the local-only paycheck transfer calculator. See
[`frontend-requirements.md`](./frontend-requirements.md) for the product spec and
[`openapi.yaml`](./openapi.yaml) for the backend contract the app expects.

The frontend only **displays** results. The paycheck auto-pick, funding
calculation, and `monthly_snapshot` insert all happen server-side.

## Run

```bash
npm install
npm run dev:mock     # no backend needed; in-browser mock API
npm run dev          # live mode; set VITE_API_PROXY_TARGET or VITE_API_BASE_URL in .env.local
npm run build        # type-check + production build to dist/
npm run preview      # serve dist/
```

## Configuration (copy `env.example` to `.env.local`)

| Variable | Meaning |
|---|---|
| `VITE_API_MODE` | `live` (default) or `mock`. `npm run dev:mock` (Vite `--mode mock`) always uses the mock. |
| `VITE_API_BASE_URL` | API origin, e.g. `http://homelab.local:8080`. Leave empty for same-origin `/api`. |
| `VITE_API_PROXY_TARGET` | Dev server only: proxy `/api` to this origin. |
| `VITE_MOCK_SCENARIO` | Default mock scenario (see below). |

## Mock scenarios

Choose a scenario from the drawer (mock mode only) or with `?mock=<name>`:

- `default`: healthy accounts plus 5 months of history
- `item_failure`: one Item needs reconnecting, so its row shows "Data unavailable" and the snapshot is not persisted
- `empty`: nothing linked, so Home shows "Link account to get started"
- `no_paycheck`: accounts exist but no qualifying deposit was found

The mock's "Hosted Link" redirects straight back to the app and completes. Mock
state lives in `localStorage` so that it survives that redirect.

## Structure

```
src/api/types.ts    types mirroring openapi.yaml
src/api/client.ts   fetch-based client
src/api/mock.ts     mock implementation + scenarios
src/link.ts         Plaid Hosted Link redirect flow
src/screens/        Home, History, Accounts
src/styles.css      all styling (CSS custom properties; .theme-light / .theme-dark)
scripts/generate-icons.mjs   regenerates the placeholder PWA icons (npm run icons)
```

Routing is hash-based (`#/`, `#/history`, `#/accounts`), so `dist/` can be served by
any static server with no SPA fallback.
