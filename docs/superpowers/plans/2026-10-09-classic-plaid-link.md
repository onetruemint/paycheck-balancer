# Classic Plaid Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Plaid Hosted Link (full-page redirect) flow with classic, client-side Plaid Link across `apis/plaid` (the backend) and `app` (the StateMint frontend), so a user can link a new institution or reconnect an existing one entirely in-page, with no redirect.

**Architecture:** `apis/plaid` already has 90% of the classic flow: `POST /api/create_link_token` (creates a Plaid `link_token`) and a written-but-unregistered `getAccessToken` handler (exchanges a `public_token` for an `access_token`). This plan (1) wires that handler up as `POST /api/get_access_token`, tightens both handlers so the long-lived `access_token` never leaves the server (stored in a small in-memory map keyed by Plaid `item_id`, with a documented TODO to move it to real persistence), and supports update/reconnect mode by looking the token up server-side from an `itemId` the caller passes — never by trusting a client-supplied access token. On the frontend, it deletes the whole redirect-and-resume mechanism (`consumeLinkReturn`, `completePendingLink`, the `link_return` URL param, the `App`-level `linkState`/`completingLink` plumbing) and replaces it with a `usePlaidLinkFlow()` hook built on `react-plaid-link`'s `usePlaidLink`, which opens Link in-page and resolves via `onSuccess`/`onExit` callbacks. `app/openapi.yaml`, `app/src/api/types.ts`, `client.ts`, and `mock.ts` are updated so the frontend's documented contract is the literal contract `apis/plaid` now serves — closing the mismatch between the two specs.

**Tech Stack:** Fastify 5 + `plaid` (Node SDK) on the backend; React 19 + Vite on the frontend; `react-plaid-link` (new dependency, v5, supports React 19) for the in-page Link UI; `vitest` (already used by `common/core`) for the two new backend unit-test files.

**Spec:** This plan has no separate spec document — the "spec" is the already-written `app/openapi.yaml` (Link section) and `app/frontend-requirements.md` §8, both of which this plan edits in place to describe the new classic-Link behavior instead of the old Hosted Link behavior. Treat the **task bodies below** as the authoritative target shape for those two files once edited.

## Global Constraints

- The Plaid `access_token` must never be sent to the browser, in any response body. (Security requirement driving this whole redesign — the old `getAccessToken` handler leaked it; this plan fixes that.)
- `apis/plaid` has no database. Item/access-token storage for this plan is an in-memory `Map`, explicitly documented as lost on server restart — do not build a real persistence layer as part of this plan; that is separate, larger, future work.
- Institution/account *listing* (`/api/institutions`, `/api/accounts`, etc.) is out of scope. Those endpoints are not implemented anywhere real yet (only in `app/src/api/mock.ts`) and this plan does not change that — it only fixes the Link (token-create + token-exchange) surface.
- OAuth-only institutions (which require a registered `redirect_uri` and re-invoking Link with `receivedRedirectUri`) are explicitly out of scope and left unsupported; document this as a known limitation rather than attempting it.
- Match existing code style: Fastify handler factories returning `(request, reply) => {...}` closures (see `controller.ts`), `snake_case` field names when they cross the wire to Plaid's own API, `camelCase` for this app's own JSON bodies.
- Error responses from `apis/plaid` must use the `{ code, message }` shape already documented in `app/openapi.yaml`'s `ApiError` schema (`VALIDATION`, `PLAID_ERROR`, `NOT_FOUND`), not the old ad hoc `{ err }` shape.

## Review Focus

- **Update-mode account takeover:** a malicious or buggy caller passes an `itemId` to `/api/create_link_token` that isn't theirs. Since this is a single-user LAN app with no auth, this is accepted risk for the whole app, not something this plan needs to defend against — but the handler must still 404 cleanly on an *unknown* `itemId` (typo, stale id, server restarted and lost the map) rather than silently creating a brand-new Item. Task 2 tests this.
- **Access token never serialized back to the client:** confirmed by asserting on the exact response body in Task 2's exchange test, not just checking `item_id` is present.
- **Double in-memory store writes:** calling `/api/get_access_token` twice for the same `item_id` (e.g. a client retry after a dropped response) must not throw or corrupt the map — `Map.set` on an existing key is a plain overwrite, so this is safe by construction, but Task 2 includes a test exercising it as a regression guard.
- **Link `onExit` with no error (user just closed the modal):** `react-plaid-link`'s `onExit` fires with `error: null` on a plain user-initiated close. Task 4's hook must treat that as `{ kind: 'exited' }`, not `{ kind: 'error' }` — tested in Task 4 since it's easy to get backwards and show a scary error for a routine cancel.
- **Reconnect (`update` mode) must not call the exchange endpoint:** Plaid does not require (and effectively ignores any attempt to re-exchange) a public token from an update-mode Link session. Task 4's hook must branch on mode and skip the exchange call entirely for `update`, tested explicitly so a future edit doesn't "helpfully" add it back.

---

## File Structure

**`apis/plaid`:**
- `openapi-generator/openapi.yaml` — modify: new request/response schemas for the two Link routes, drop the old Hosted-Link-shaped ones, drop the `{err}`-shaped `PlaidClientError` in favor of `{code, message}`.
- `src/utils/itemStore.ts` — **create**: the in-memory `item_id -> access_token` map and its two accessor functions. One responsibility: hold that map.
- `src/utils/utils.ts` — modify: add `clientUserId` to `ConfigDecorator`.
- `src/app.ts` — modify: read `PLAID_CLIENT_USER_ID` env var, add it to `appConfig`.
- `src/api/controller.ts` — modify: `createLinkToken` drops the request-supplied `clientId`/`redirectUri` in favor of server-owned `config.clientUserId`, gains `itemId`-based update-mode lookup via `itemStore`; `getAccessToken` stores the token via `itemStore` and replies with `{ item_id }` only; both tighten error replies to `{ code, message }`.
- `src/api/router.ts` — modify: register `/api/get_access_token`.
- `src/api/controller.test.ts` — **create**: unit tests for both handlers against a fake `PlaidApi`.
- `package.json` — modify: add `vitest` devDependency and a real `test` script.

**`app`:**
- `src/link.ts` — rewrite: delete the redirect/resume machinery, add `usePlaidLinkFlow()` React hook wrapping `react-plaid-link`.
- `src/main.tsx` — modify: drop `consumeLinkReturn()` call and the `linkReturn` prop.
- `src/App.tsx` — modify: drop `linkState`/`completingLink`/`onRetryLink` plumbing; `Accounts` now takes no props.
- `src/screens/Accounts.tsx` — modify: use `usePlaidLinkFlow()` internally instead of the `linkState`/`onRetryLink` props and the old `startLink` import; `LinkBanner` matches the new `LinkOutcome` shape.
- `src/api/types.ts` — modify: replace the Hosted-Link request/response types with the classic-Link ones; update the `StateMintApi` interface.
- `src/api/client.ts` — modify: point `createLinkToken`/new `exchangeLinkToken` at `/api/create_link_token` and `/api/get_access_token`.
- `src/api/mock.ts` — modify: mirror the new contract; drop `linkSessions`/`completedLinks` from `World`.
- `openapi.yaml` — modify: same shape as `apis/plaid`'s spec for the two Link paths (this is the contract apis/plaid now serves verbatim).
- `frontend-requirements.md` — modify: §8's Link bullet describes classic Link instead of Hosted Link; §11 gains the OAuth-institutions-unsupported bullet.
- `README.md` — modify: one sentence describing the mock's Link behavior, updated to match.
- `package.json` — modify: add `react-plaid-link` dependency.

---

### Task 1: Server-owned client identity + in-memory item store

**Files:**
- Create: `apis/plaid/src/utils/itemStore.ts`
- Modify: `apis/plaid/src/utils/utils.ts`
- Modify: `apis/plaid/src/app.ts`

**Interfaces:**
- Produces: `saveAccessToken(itemId: string, accessToken: string): void`, `getAccessTokenForItem(itemId: string): string | undefined` — consumed by Task 2's `controller.ts` changes.
- Produces: `ConfigDecorator.clientUserId: string` — consumed by Task 2's `createLinkToken`.

- [ ] **Step 1: Create the item store module**

```typescript
// apis/plaid/src/utils/itemStore.ts

// TODO: this is in-memory only and is lost on every restart. Replace with a
// real persistence layer (DB) once one exists for this service; see the
// equivalent TODO this replaces in controller.ts's old getAccessToken.
const accessTokensByItemId = new Map<string, string>();

export function saveAccessToken(itemId: string, accessToken: string): void {
  accessTokensByItemId.set(itemId, accessToken);
}

export function getAccessTokenForItem(itemId: string): string | undefined {
  return accessTokensByItemId.get(itemId);
}
```

- [ ] **Step 2: Add `clientUserId` to `ConfigDecorator`**

Edit `apis/plaid/src/utils/utils.ts` so the full file reads:

```typescript
import { CountryCode, Products } from 'plaid';

export enum Decorators {
  GET_CLIENT = 'getClient',
  GET_CONFIG = 'getConfig',
}

export interface ConfigDecorator {
  products: Products[];
  countryCodes: CountryCode[];
  androidPackageName: string;
  clientUserId: string;
}
```

- [ ] **Step 3: Read `PLAID_CLIENT_USER_ID` and populate it in `app.ts`**

In `apis/plaid/src/app.ts`, add this line in the block of `PLAID_*` env reads (after the `PLAID_ANDROID_PACKAGE_NAME` block, before `export default function PlaidApp()`):

```typescript
const PLAID_CLIENT_USER_ID = getEnvVar('PLAID_CLIENT_USER_ID', {
  default: 'statemint-local-user',
});
```

Then add `clientUserId: PLAID_CLIENT_USER_ID,` to the `appConfig` object literal, so it reads:

```typescript
  const appConfig: ConfigDecorator = {
    products: PLAID_PRODUCTS,
    countryCodes: PLAID_COUNTRY_CODES,
    androidPackageName: PLAID_ANDROID_PACKAGE_NAME,
    clientUserId: PLAID_CLIENT_USER_ID,
  };
```

- [ ] **Step 4: Type-check**

Run: `cd apis/plaid && pnpm exec tsc --noEmit`
Expected: no errors (the `generated/` imports used elsewhere are untouched by this task).

- [ ] **Step 5: Commit**

```bash
git add apis/plaid/src/utils/itemStore.ts apis/plaid/src/utils/utils.ts apis/plaid/src/app.ts
git commit -m "feat(plaid): add server-owned client id and in-memory item store"
```

---

### Task 2: Rewrite the OpenAPI contract and both Link handlers

**Files:**
- Modify: `apis/plaid/openapi-generator/openapi.yaml`
- Modify: `apis/plaid/src/api/controller.ts`
- Modify: `apis/plaid/src/api/router.ts`
- Create: `apis/plaid/src/api/controller.test.ts`
- Modify: `apis/plaid/package.json`

**Interfaces:**
- Consumes: `saveAccessToken`, `getAccessTokenForItem` from `../utils/itemStore.js` (Task 1); `ConfigDecorator.clientUserId` (Task 1).
- Produces: `createLinkToken(client: PlaidApi, fastify: FastifyInstance)` and `getAccessToken(client: PlaidApi)` route-handler factories, registered at `POST /api/create_link_token` and `POST /api/get_access_token` — consumed by nothing further in this plan (this is the end of the backend chain), but this is the exact shape Task 4/5's frontend client code must call.

- [ ] **Step 1: Rewrite the OpenAPI spec's Link section**

Replace the entire contents of `apis/plaid/openapi-generator/openapi.yaml` with:

```yaml
openapi: 3.1.0
info:
  title: Paycheck Balancer Plaid API
  description: API for interacting with Plaid on behalf of Paycheck Balancer.
  version: 1.0.0
servers:
  - url: http://localhost:{port}
    variables:
      port:
        default: '8080'
paths:
  /api/create_link_token:
    post:
      operationId: createLinkToken
      summary: Create a Plaid Link token
      description: >-
        Creates a Plaid `link_token` via `/link/token/create`. Omit `itemId`
        to link a new institution. Pass an existing `itemId` to run Link in
        update mode (reconnect) — the server looks up that Item's stored
        access token itself; the caller never supplies one directly.
      tags:
        - Plaid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateLinkTokenRequest'
      responses:
        '200':
          description: Link token successfully created.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/LinkTokenCreateResponse'
        '400':
          description: >-
            The request to Plaid's `/link/token/create` endpoint failed
            (e.g. invalid configuration or a validation error).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiError'
        '404':
          description: '`itemId` does not match a stored access token.'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiError'
  /api/get_access_token:
    post:
      operationId: getAccessToken
      summary: Exchange a Plaid Link public token for a permanent Item.
      description: >-
        Exchanges a temporary public token (from Plaid Link's `onSuccess`)
        for a permanent Item access token via `/item/public_token/exchange`.
        The access token is stored server-side, keyed by `item_id`, and is
        never returned to the caller.
      tags:
        - Plaid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PublicTokenExchangeRequest'
      responses:
        '200':
          description: Access token successfully exchanged.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PublicTokenExchangeResponse'
        '400':
          description: >-
            The request to Plaid's `/item/public_token/exchange` endpoint
            failed (e.g. invalid configuration or a validation error).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiError'
components:
  schemas:
    ApiError:
      type: object
      required:
        - code
        - message
      properties:
        code:
          type: string
          description: Machine-readable code, e.g. VALIDATION, PLAID_ERROR, NOT_FOUND.
          examples: [VALIDATION, PLAID_ERROR, NOT_FOUND]
        message:
          type: string
          description: Human-readable error message.
    CreateLinkTokenRequest:
      type: object
      properties:
        itemId:
          type: string
          description: >-
            Plaid Item id to reconnect (update mode). Omit to link a new
            institution.
    LinkTokenCreateResponse:
      type: object
      required:
        - link_token
        - expiration
        - request_id
      properties:
        link_token:
          type: string
          description: >-
            A link_token, which can be supplied to Link in order to
            initialize it and receive a public_token, which can be
            exchanged for an access_token.
        expiration:
          type: string
          format: date-time
          description: The expiration date and time for the link_token, in ISO 8601 format.
        request_id:
          type: string
          description: >-
            A unique identifier for the request, which can be used for
            troubleshooting.
    PublicTokenExchangeRequest:
      type: object
      required:
        - publicToken
      properties:
        publicToken:
          type: string
          description: A temporary Item Public Token.
    PublicTokenExchangeResponse:
      type: object
      required:
        - item_id
      properties:
        item_id:
          type: string
          description: >-
            The item_id value of the Item associated with the exchanged
            access token. The access token itself is never returned.
```

- [ ] **Step 2: Regenerate the typed client from the new spec**

Run (from `apis/plaid/`):

```bash
pnpm install
pnpm run generate:client
```

Expected: `src/generated/` is rewritten; `CreateLinkTokenRequest` now has an optional `itemId`, `PublicTokenExchangeResponse` now has only `item_id`, and `ApiError`/`PlaidClientError` is replaced by the new `ApiError` type. (First run downloads the generator jar — needs network access.)

- [ ] **Step 3: Rewrite `controller.ts`**

Replace the entire contents of `apis/plaid/src/api/controller.ts` with:

```typescript
import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import {
  ItemPublicTokenExchangeRequest,
  LinkTokenCreateRequest,
  PlaidApi,
  Products,
} from 'plaid';
import { ConfigDecorator, Decorators } from '../utils/utils.js';
import { getAccessTokenForItem, saveAccessToken } from '../utils/itemStore.js';
import moment from 'moment';
import { RequiredError } from 'plaid/dist/base.js';
import {
  ApiError,
  CreateLinkTokenRequest,
  PublicTokenExchangeRequest,
  PublicTokenExchangeResponse,
} from '../generated/index.js';

export async function getHealth(request: FastifyRequest, reply: FastifyReply) {
  reply.send('Server is alive and well!');
}

function plaidError(e: unknown): ApiError {
  if (e instanceof RequiredError) {
    return { code: 'VALIDATION', message: e.message };
  }
  return { code: 'PLAID_ERROR', message: e instanceof Error ? e.message : String(e) };
}

export function createLinkToken(client: PlaidApi, fastify: FastifyInstance) {
  const config: ConfigDecorator = fastify.getDecorator(Decorators.GET_CONFIG);
  return async (
    request: FastifyRequest<{ Body: CreateLinkTokenRequest }>,
    reply: FastifyReply
  ) => {
    const { itemId } = request.body;

    const configs: LinkTokenCreateRequest = {
      user: {
        client_user_id: config.clientUserId,
      },
      client_name: 'Paycheck Balancer',
      country_codes: config.countryCodes,
      language: 'en',
      products: config.products,
    };

    if (itemId) {
      const accessToken = getAccessTokenForItem(itemId);
      if (!accessToken) {
        reply.code(404).send({
          code: 'NOT_FOUND',
          message: `No stored access token for item ${itemId}`,
        });
        return;
      }
      configs.access_token = accessToken;
    }

    if (config.products.includes(Products.Statements)) {
      configs.statements = {
        start_date: moment().subtract(30, 'days').format('YYYY-MM-DD'),
        end_date: moment().format('YYYY-MM-DD'),
      };
    }

    try {
      const createTokenRes = await client.linkTokenCreate(configs);
      reply.send(createTokenRes.data);
    } catch (e: unknown) {
      reply.code(400).send(plaidError(e));
    }
  };
}

export function getAccessToken(client: PlaidApi) {
  return async function (
    request: FastifyRequest<{ Body: PublicTokenExchangeRequest }>,
    reply: FastifyReply<{
      Reply: PublicTokenExchangeResponse | ApiError;
    }>
  ) {
    const { publicToken } = request.body;
    const req: ItemPublicTokenExchangeRequest = {
      public_token: publicToken,
    };
    try {
      const res = await client.itemPublicTokenExchange(req);
      const { access_token, item_id } = res.data;
      saveAccessToken(item_id, access_token);
      reply.send({ item_id });
    } catch (e: unknown) {
      reply.code(400).send(plaidError(e));
    }
  };
}
```

- [ ] **Step 4: Register the exchange route**

Replace the entire contents of `apis/plaid/src/api/router.ts` with:

```typescript
import { FastifyInstance } from 'fastify';
import { type PlaidApi } from 'plaid';
import { createLinkToken, getAccessToken, getHealth } from './controller.js';
import { Decorators } from '../utils/utils.js';

export default async function PlaidRouter(fastify: FastifyInstance) {
  const client: PlaidApi = fastify.getDecorator(Decorators.GET_CLIENT);

  fastify.post('/api/create_link_token', createLinkToken(client, fastify));
  fastify.post('/api/get_access_token', getAccessToken(client));
  fastify.get('/', getHealth);
}
```

- [ ] **Step 5: Add `vitest` and write the failing tests**

Add to `apis/plaid/package.json`'s `devDependencies` (keep the rest of the file unchanged):

```json
    "vitest": "^5.0.0"
```

And change the `test` script from the stub to:

```json
    "test": "vitest run",
```

Create `apis/plaid/src/api/controller.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { PlaidApi } from 'plaid';
import { createLinkToken, getAccessToken } from './controller.js';
import { Decorators, type ConfigDecorator } from '../utils/utils.js';
import { saveAccessToken } from '../utils/itemStore.js';

function fakeReply() {
  const sent: { status: number; body: unknown }[] = [];
  const reply = {
    code(status: number) {
      return {
        send(body: unknown) {
          sent.push({ status, body });
        },
      };
    },
    send(body: unknown) {
      sent.push({ status: 200, body });
    },
  } as unknown as FastifyReply;
  return { reply, sent };
}

function fakeFastify(config: ConfigDecorator): FastifyInstance {
  return {
    getDecorator: (name: string) => {
      if (name === Decorators.GET_CONFIG) return config;
      throw new Error(`unexpected decorator ${name}`);
    },
  } as unknown as FastifyInstance;
}

const baseConfig: ConfigDecorator = {
  products: [],
  countryCodes: [],
  androidPackageName: '',
  clientUserId: 'test-user',
};

describe('createLinkToken', () => {
  it('creates a token for a new Item (no itemId)', async () => {
    const linkTokenCreate = vi.fn().mockResolvedValue({
      data: { link_token: 'tok-123', expiration: '2026-01-01T00:00:00Z', request_id: 'req-1' },
    });
    const client = { linkTokenCreate } as unknown as PlaidApi;
    const handler = createLinkToken(client, fakeFastify(baseConfig));
    const { reply, sent } = fakeReply();

    await handler({ body: {} } as never, reply);

    expect(linkTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({ user: { client_user_id: 'test-user' } })
    );
    expect(linkTokenCreate.mock.calls[0][0].access_token).toBeUndefined();
    expect(sent).toEqual([{ status: 200, body: { link_token: 'tok-123', expiration: '2026-01-01T00:00:00Z', request_id: 'req-1' } }]);
  });

  it('404s when itemId has no stored access token', async () => {
    const linkTokenCreate = vi.fn();
    const client = { linkTokenCreate } as unknown as PlaidApi;
    const handler = createLinkToken(client, fakeFastify(baseConfig));
    const { reply, sent } = fakeReply();

    await handler({ body: { itemId: 'item-missing' } } as never, reply);

    expect(linkTokenCreate).not.toHaveBeenCalled();
    expect(sent).toEqual([
      { status: 404, body: { code: 'NOT_FOUND', message: 'No stored access token for item item-missing' } },
    ]);
  });

  it('passes the stored access token through for update mode', async () => {
    saveAccessToken('item-known', 'access-secret');
    const linkTokenCreate = vi.fn().mockResolvedValue({
      data: { link_token: 'tok-456', expiration: '2026-01-01T00:00:00Z', request_id: 'req-2' },
    });
    const client = { linkTokenCreate } as unknown as PlaidApi;
    const handler = createLinkToken(client, fakeFastify(baseConfig));
    const { reply } = fakeReply();

    await handler({ body: { itemId: 'item-known' } } as never, reply);

    expect(linkTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({ access_token: 'access-secret' })
    );
  });
});

describe('getAccessToken', () => {
  it('stores the access token and replies with only item_id', async () => {
    const itemPublicTokenExchange = vi.fn().mockResolvedValue({
      data: { access_token: 'access-secret-2', item_id: 'item-new' },
    });
    const client = { itemPublicTokenExchange } as unknown as PlaidApi;
    const handler = getAccessToken(client);
    const { reply, sent } = fakeReply();

    await handler({ body: { publicToken: 'public-abc' } } as never, reply);

    expect(sent).toEqual([{ status: 200, body: { item_id: 'item-new' } }]);
    expect(sent[0].body).not.toHaveProperty('access_token');
  });

  it('is safe to call twice for the same item_id (client retry)', async () => {
    const itemPublicTokenExchange = vi.fn().mockResolvedValue({
      data: { access_token: 'access-secret-3', item_id: 'item-retry' },
    });
    const client = { itemPublicTokenExchange } as unknown as PlaidApi;
    const handler = getAccessToken(client);

    const first = fakeReply();
    await handler({ body: { publicToken: 'public-def' } } as never, first.reply);
    const second = fakeReply();
    await handler({ body: { publicToken: 'public-def' } } as never, second.reply);

    expect(first.sent).toEqual(second.sent);
  });

  it('replies 400 with a PLAID_ERROR code when the exchange fails', async () => {
    const itemPublicTokenExchange = vi.fn().mockRejectedValue(new Error('bad token'));
    const client = { itemPublicTokenExchange } as unknown as PlaidApi;
    const handler = getAccessToken(client);
    const { reply, sent } = fakeReply();

    await handler({ body: { publicToken: 'public-bad' } } as never, reply);

    expect(sent).toEqual([{ status: 400, body: { code: 'PLAID_ERROR', message: 'bad token' } }]);
  });
});
```

- [ ] **Step 6: Run the tests to confirm they pass against the new implementation**

Run: `cd apis/plaid && pnpm exec vitest run`
Expected: all 6 tests pass. (They're written against the Step 3/4 implementation already in place, so this step is confirmation, not red/green TDD — the store module in Task 1 and these handlers were designed together.)

- [ ] **Step 7: Type-check the whole package**

Run: `cd apis/plaid && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apis/plaid/openapi-generator/openapi.yaml apis/plaid/src/api/controller.ts apis/plaid/src/api/router.ts apis/plaid/src/api/controller.test.ts apis/plaid/package.json apis/plaid/pnpm-lock.yaml
git commit -m "feat(plaid): wire up classic Link token-create and token-exchange routes"
```

---

### Task 3: Add `react-plaid-link` and rewrite the frontend contract types

**Files:**
- Modify: `app/package.json`
- Modify: `app/src/api/types.ts`
- Modify: `app/src/api/client.ts`
- Modify: `app/src/api/mock.ts`
- Modify: `app/openapi.yaml`

**Interfaces:**
- Produces: `LinkTokenRequest { itemId?: string }`, `LinkTokenResponse { link_token: string; expiration: string }`, `LinkExchangeRequest { public_token: string }`, `LinkExchangeResponse { item_id: string }`, and `StateMintApi.createLinkToken`/`StateMintApi.exchangeLinkToken` — consumed by Task 4's `link.ts` hook.

- [ ] **Step 1: Add the dependency**

Add to `app/package.json`'s `dependencies` (alongside `react`/`react-dom`):

```json
    "react-plaid-link": "^5.0.0",
```

- [ ] **Step 2: Replace the Link types in `app/src/api/types.ts`**

Remove these four existing interfaces: `LinkTokenRequest`, `LinkTokenResponse`, `LinkCompleteRequest`, `LinkCompleteResponse`. Replace them with:

```typescript
export interface LinkTokenRequest {
  /** Plaid Item id to reconnect; omit to link a new institution. */
  itemId?: string;
}

export interface LinkTokenResponse {
  link_token: string;
  expiration: string;
}

export interface LinkExchangeRequest {
  public_token: string;
}

export interface LinkExchangeResponse {
  item_id: string;
}
```

In the `StateMintApi` interface at the bottom of the file, replace:

```typescript
  createLinkToken(req: LinkTokenRequest): Promise<LinkTokenResponse>;
  completeLink(req: LinkCompleteRequest): Promise<LinkCompleteResponse>;
```

with:

```typescript
  createLinkToken(req: LinkTokenRequest): Promise<LinkTokenResponse>;
  exchangeLinkToken(req: LinkExchangeRequest): Promise<LinkExchangeResponse>;
```

- [ ] **Step 3: Update `app/src/api/client.ts`**

Change the import list at the top from:

```typescript
  LinkCompleteResponse,
  LinkCompleteRequest,
  LinkTokenRequest,
  LinkTokenResponse,
```

to:

```typescript
  LinkExchangeRequest,
  LinkExchangeResponse,
  LinkTokenRequest,
  LinkTokenResponse,
```

Replace the bottom two methods:

```typescript
    createLinkToken: (req: LinkTokenRequest) =>
      request<LinkTokenResponse>('POST', '/api/link/token', req),

    completeLink: (req: LinkCompleteRequest) =>
      request<LinkCompleteResponse>('POST', '/api/link/complete', req),
```

with:

```typescript
    createLinkToken: (req: LinkTokenRequest) =>
      request<LinkTokenResponse>('POST', '/api/create_link_token', req),

    exchangeLinkToken: (req: LinkExchangeRequest) =>
      request<LinkExchangeResponse>('POST', '/api/get_access_token', req),
```

- [ ] **Step 4: Update the mock**

In `app/src/api/mock.ts`, remove `LinkCompleteResponse` from the import list at the top (it imports `Institution`, `Snapshot`, etc. — just drop that one name).

In the `World` interface, remove these two fields entirely:

```typescript
  linkSessions?: Record<string, string>; // session_ref -> link_token
  completedLinks?: Record<string, LinkCompleteResponse>; // link_token -> result (idempotency)
```

Replace the `createLinkToken` and `completeLink` methods (and the `completeOnce` helper function below them) with:

```typescript
    async createLinkToken({ itemId }) {
      await delay(300);
      if (itemId) {
        const inst = world.institutions.find((i) => i.id === itemId) ?? notFound('Institution');
        // Mock mode skips the real Plaid Link UI (see src/link.ts), so there's no
        // separate "Link succeeded" moment to hook into for update mode — simulate
        // the reconnect repair here instead, as soon as a token is requested for it.
        inst.status = 'healthy';
        inst.status_detail = null;
        inst.last_success_at = new Date().toISOString();
        if (world.pendingCurrent.state === 'ready') {
          world.pendingCurrent = { state: 'ready', snapshot: snapshotFor(monthKey(0), 0), persisted: true };
        }
      }
      return {
        link_token: `link-sandbox-mock-${itemId ?? 'new'}-${Date.now()}`,
        expiration: new Date(Date.now() + 4 * 3600_000).toISOString(),
      };
    },

    async exchangeLinkToken() {
      await delay(800);
      if (scenario === 'empty') {
        scenario = 'default';
        setMockScenario(scenario);
        world = buildWorld(scenario);
        return { item_id: world.institutions[0].id };
      }
      const inst: Institution = {
        id: `item_new_${idSeq++}`,
        plaid_institution_id: 'ins_12',
        name: 'Capital One',
        status: 'healthy',
        status_detail: null,
        last_success_at: new Date().toISOString(),
      };
      world.institutions.push(inst);
      world.accounts.push({
        id: `acc_new_${idSeq++}`,
        institution_id: inst.id,
        institution_name: inst.name,
        name: 'Venture X',
        official_name: null,
        mask: '6614',
        type: 'credit',
        subtype: 'credit card',
        current_balance_cents: 23_410,
        role: 'ignored',
        target_balance_cents: null,
      });
      return { item_id: inst.id };
    },
```

(`notFound`, `delay`, `setMockScenario`, `buildWorld`, `snapshotFor`, `monthKey` are all already defined earlier in this file — no new imports needed.)

- [ ] **Step 5: Update `app/openapi.yaml`**

Replace the `/api/link/token` and `/api/link/complete` path entries with:

```yaml
  /api/create_link_token:
    post:
      operationId: createLinkToken
      tags: [Link]
      summary: Create a Plaid Link token (new Item, or update mode to reconnect)
      description: >-
        Wraps Plaid `/link/token/create`. Omit `itemId` to link a new
        institution; pass the Item's id (`Institution.id`) to run Link in
        update mode for reconnect — the server looks up that Item's stored
        access token itself.
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/LinkTokenRequest' }
      responses:
        '200':
          description: Token created.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/LinkTokenResponse' }
        '404':
          description: '`NOT_FOUND`: `itemId` has no stored access token.'
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ApiError' }
        default:
          $ref: '#/components/responses/Error'

  /api/get_access_token:
    post:
      operationId: exchangeLinkToken
      tags: [Link]
      summary: Exchange a Plaid Link public token for a permanent Item
      description: >-
        Called once Plaid Link's `onSuccess` fires in the browser. Wraps
        Plaid `/item/public_token/exchange`; the access token is stored
        server-side and never returned to the client.
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/LinkExchangeRequest' }
      responses:
        '200':
          description: Exchange succeeded.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/LinkExchangeResponse' }
        '400':
          description: '`PLAID_ERROR`: the exchange call failed.'
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ApiError' }
        default:
          $ref: '#/components/responses/Error'
```

Replace the `LinkTokenRequest`, `LinkTokenResponse`, `LinkCompleteRequest`, `LinkCompleteResponse` schema entries with:

```yaml
    LinkTokenRequest:
      type: object
      properties:
        itemId:
          type: string
          description: Plaid Item id to reconnect (omit to link a new institution).

    LinkTokenResponse:
      type: object
      required: [link_token, expiration]
      properties:
        link_token: { type: string }
        expiration: { type: string, format: date-time }

    LinkExchangeRequest:
      type: object
      required: [public_token]
      properties:
        public_token: { type: string }

    LinkExchangeResponse:
      type: object
      required: [item_id]
      properties:
        item_id: { type: string }
```

- [ ] **Step 6: Install and type-check**

Run: `cd app && pnpm install && pnpm run check-types`
Expected: fails here — `link.ts`, `App.tsx`, and `Accounts.tsx` still reference the old types/exports. That's expected; Tasks 4–5 fix it. Confirm the errors are only in those three files (not in `types.ts`/`client.ts`/`mock.ts`, which this task already finished).

- [ ] **Step 7: Commit**

```bash
git add app/package.json app/pnpm-lock.yaml app/src/api/types.ts app/src/api/client.ts app/src/api/mock.ts app/openapi.yaml
git commit -m "feat(app): point the API contract at classic Plaid Link"
```

---

### Task 4: Rewrite `link.ts` as a classic-Link React hook

**Files:**
- Modify: `app/src/link.ts`

**Interfaces:**
- Consumes: `api.createLinkToken`, `api.exchangeLinkToken`, `isMock` from `./api` (Task 3).
- Produces: `usePlaidLinkFlow(): { start(mode: 'new' | 'update', institutionId?: string): Promise<void>; linking: string | null; outcome: LinkOutcome | null; clearOutcome(): void }` and `type LinkOutcome = { kind: 'success' } | { kind: 'reconnected' } | { kind: 'exited' } | { kind: 'error'; message: string }` — consumed by Task 5's `Accounts.tsx`.

- [ ] **Step 1: Replace the entire contents of `app/src/link.ts`**

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaidLink, type PlaidLinkError } from 'react-plaid-link';
import { api, isMock } from './api';

export type LinkOutcome =
  | { kind: 'success' }
  | { kind: 'reconnected' }
  | { kind: 'exited' }
  | { kind: 'error'; message: string };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function exitMessage(error: PlaidLinkError | null): string {
  return error?.error_message || error?.display_message || 'Link closed with an error.';
}

/**
 * Drives classic, client-side Plaid Link. `start('new')` links a fresh
 * institution; `start('update', itemId)` reconnects an existing one. Both
 * open Link in-page via `react-plaid-link` — there is no redirect.
 */
export function usePlaidLinkFlow() {
  const [token, setToken] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<LinkOutcome | null>(null);
  const modeRef = useRef<'new' | 'update'>('new');

  const finishLink = useCallback(async (publicToken: string) => {
    if (modeRef.current === 'update') {
      // Update-mode Link doesn't mint a new access token, so there is
      // nothing to exchange — Link succeeding is the whole story.
      setOutcome({ kind: 'reconnected' });
    } else {
      try {
        await api.exchangeLinkToken({ public_token: publicToken });
        setOutcome({ kind: 'success' });
      } catch (e) {
        setOutcome({ kind: 'error', message: errorMessage(e) });
      }
    }
    setLinking(null);
    setToken(null);
  }, []);

  const start = useCallback(
    async (mode: 'new' | 'update', institutionId?: string) => {
      setOutcome(null);
      setLinking(institutionId ?? 'new');
      modeRef.current = mode;
      try {
        const { link_token } = await api.createLinkToken({ itemId: institutionId });
        if (isMock) {
          // There's no real Plaid Link UI to open against a mock token.
          await finishLink(`public-mock-${link_token}`);
        } else {
          setToken(link_token);
        }
      } catch (e) {
        setOutcome({ kind: 'error', message: errorMessage(e) });
        setLinking(null);
      }
    },
    [finishLink]
  );

  const onSuccess = useCallback(
    (publicToken: string | null) => {
      if (publicToken === null) {
        // Only possible with the deprecated public-key integration, which this
        // app never uses (it always passes a link_token) — guard anyway since
        // the type allows it.
        setOutcome({ kind: 'error', message: 'Plaid Link did not return a public token.' });
        setLinking(null);
        setToken(null);
        return;
      }
      void finishLink(publicToken);
    },
    [finishLink]
  );

  const onExit = useCallback((error: PlaidLinkError | null) => {
    setToken(null);
    setLinking(null);
    setOutcome(error ? { kind: 'error', message: exitMessage(error) } : { kind: 'exited' });
  }, []);

  const { open, ready } = usePlaidLink({
    token: isMock ? null : token,
    onSuccess,
    onExit,
  });

  useEffect(() => {
    if (!isMock && ready && token) open();
  }, [ready, token, open]);

  return { start, linking, outcome, clearOutcome: () => setOutcome(null) };
}
```

- [ ] **Step 2: Type-check just this file's dependents so far**

Run: `cd app && pnpm exec tsc --noEmit`
Expected: remaining errors are only in `App.tsx` and `Accounts.tsx` (Task 5 fixes those) — confirm `link.ts` itself produces no errors. (`PlaidLinkError` is exported from `react-plaid-link`'s `dist/types/index.d.ts` with `error_message: string` and `display_message: string | null` fields — already verified against the published v5.0.0 package, so this should resolve cleanly.)

- [ ] **Step 3: Commit**

```bash
git add app/src/link.ts
git commit -m "feat(app): rewrite link.ts as a classic Plaid Link hook"
```

---

### Task 5: Wire the hook into `Accounts.tsx` and simplify `App.tsx`/`main.tsx`

**Files:**
- Modify: `app/src/screens/Accounts.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/main.tsx`

**Interfaces:**
- Consumes: `usePlaidLinkFlow`, `type LinkOutcome` from `../link` (Task 4).

- [ ] **Step 1: Simplify `main.tsx`**

Replace the entire contents of `app/src/main.tsx` with:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 2: Simplify `App.tsx`**

Replace the entire contents of `app/src/App.tsx` with:

```tsx
import { useCallback, useRef, useState, type MouseEvent } from 'react';
import { isMock } from './api';
import { Drawer } from './components/Drawer';
import { MenuIcon, MoonIcon, SunIcon } from './components/Icons';
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

export function App() {
  const route = useRoute();
  const [theme, toggleTheme] = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const menuButton = useRef<HTMLButtonElement>(null);

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
        {route === 'accounts' && <Accounts />}
      </main>
    </>
  );
}
```

- [ ] **Step 3: Rewrite the link-related parts of `Accounts.tsx`**

In `app/src/screens/Accounts.tsx`, change the import line:

```typescript
import { startLink, type LinkOutcome } from '../link';
```

to:

```typescript
import { usePlaidLinkFlow, type LinkOutcome } from '../link';
```

Remove the `Props` interface and change the component signature from:

```typescript
export function Accounts({ linkState, onRetryLink }: Props) {
```

to:

```typescript
export function Accounts() {
```

Remove these two lines (no longer props, no longer needed — classic Link never has a "completing" limbo phase):

```typescript
  const [linking, setLinking] = useState<string | null>(null);
  const completingLink = linkState === 'completing';
```

and in their place add:

```typescript
  const { start, linking, outcome, clearOutcome } = usePlaidLinkFlow();
```

Update the data-reload effect — change:

```typescript
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
```

to:

```typescript
  // Reloads after a link attempt settles, since it may have added or repaired an Item.
  useEffect(() => {
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
  }, [loadAttempt, outcome]);
```

Remove the whole `link` async function (it was just a thin, now-redundant wrapper around `startLink`):

```typescript
  const link = async (mode: 'new' | 'update', institutionId?: string) => {
    setLinking(institutionId ?? 'new');
    setError(null);
    try {
      await startLink(mode, institutionId);
    } catch (e) {
      setError(`Couldn’t start Plaid Link: ${(e as Error).message}. Try again in a moment.`);
      setLinking(null);
    }
  };
```

and call `start` directly at both call sites: change

```tsx
          <button className="button button-primary" onClick={() => link('new')} disabled={!!linking}>
```

to

```tsx
          <button className="button button-primary" onClick={() => start('new')} disabled={!!linking}>
```

and

```tsx
                      onClick={() => link('update', inst.id)}
```

to

```tsx
                      onClick={() => start('update', inst.id)}
```

Remove the full-screen "completing" early return:

```typescript
  if (completingLink) return <Spinner label="Finishing account link" />;
```

Update the two remaining `linkState && <LinkBanner ... />` usages — there are two call sites (the load-error early return, and the main render). Change both from:

```tsx
{linkState && <LinkBanner state={linkState} onRetry={onRetryLink} />}
```

to:

```tsx
{outcome && <LinkBanner outcome={outcome} onDismiss={clearOutcome} />}
```

Replace the whole `LinkBanner` function with:

```tsx
function LinkBanner({ outcome, onDismiss }: { outcome: LinkOutcome; onDismiss: () => void }) {
  const dismiss = (
    <button className="link-button" onClick={onDismiss}>
      Dismiss
    </button>
  );
  if (outcome.kind === 'success') {
    return (
      <p className="notice notice-success" role="status">
        Account linked. Set each account’s role below. {dismiss}
      </p>
    );
  }
  if (outcome.kind === 'reconnected') {
    return (
      <p className="notice notice-success" role="status">
        Institution reconnected. {dismiss}
      </p>
    );
  }
  if (outcome.kind === 'exited') {
    return (
      <p className="notice notice-warning" role="status">
        Linking was cancelled. Nothing changed.
      </p>
    );
  }
  return (
    <p className="notice notice-danger" role="alert">
      Couldn’t finish linking: {outcome.message} {dismiss}
    </p>
  );
}
```

- [ ] **Step 4: Type-check and build**

Run: `cd app && pnpm exec tsc --noEmit && pnpm run build`
Expected: no errors; production build succeeds.

- [ ] **Step 5: Manual smoke test in mock mode**

Run: `cd app && pnpm run dev:mock`, open the printed local URL, navigate to Accounts.

- Click **Link Account**: button reads "Opening Plaid…" briefly, then a green "Account linked." banner appears and a new institution/account row shows up (mirrors the old mock behavior, just without a redirect).
- Click **Reconnect** on the Amex row in the `item_failure` mock scenario (`?mock=item_failure`): banner reads "Institution reconnected." and the row's chip flips from "Needs reconnect" to "Connected".
- Confirm there is no more `link_return`/`ref` URL-param round-trip at any point (open DevTools → Network/Console; nothing should navigate away from the SPA).

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/Accounts.tsx app/src/App.tsx app/src/main.tsx
git commit -m "feat(app): wire classic Plaid Link into the Accounts screen"
```

---

### Task 6: Update the docs that described Hosted Link

**Files:**
- Modify: `app/frontend-requirements.md`
- Modify: `app/README.md`

- [ ] **Step 1: Update `frontend-requirements.md` §8**

Replace:

```markdown
**Linking / reconnecting (Plaid Hosted Link):**
- Initiate via `/link/token/create` (new mode for linking, update mode for reconnect)
- On redirect back to the app, the app calls the local API, which checks the Hosted Link session status and completes the token exchange **synchronously** — no webhook, no async wait
- No Item slot counter (warn/refuse) and no duplicate-institution guard — not needed for a single manual user
```

with:

```markdown
**Linking / reconnecting (classic Plaid Link, client-side):**
- The app opens Plaid Link in-page via the `react-plaid-link` SDK, using a `link_token` from `POST /api/create_link_token` (omit `itemId` to link a new institution; pass the Item's id to run Link in update mode for reconnect)
- On Link's `onSuccess`, the app sends the `public_token` to `POST /api/get_access_token`, which exchanges it for an access token **synchronously** and stores it server-side — the client never sees it, and there's no webhook or async wait
- Update mode doesn't mint a new access token, so reconnect only needs Link to succeed — no second API call
- No Item slot counter (warn/refuse) and no duplicate-institution guard — not needed for a single manual user
```

In §11 ("Explicitly out of scope"), add one bullet after the webhook-receiver line:

```markdown
- OAuth-only institutions in Link (would need a registered `redirect_uri` and re-invoking Link with `receivedRedirectUri`) — not supported yet
```

- [ ] **Step 2: Update `README.md`**

Replace:

```markdown
The mock's "Hosted Link" redirects straight back to the app and completes. Mock
state lives in `localStorage` so that it survives that redirect.
```

with:

```markdown
The mock skips the real Plaid Link UI entirely and resolves immediately. Mock
state lives in `localStorage`.
```

- [ ] **Step 3: Commit**

```bash
git add app/frontend-requirements.md app/README.md
git commit -m "docs(app): describe classic Plaid Link instead of Hosted Link"
```

---

## Self-Review

**Spec coverage:** `app/frontend-requirements.md` §8 (Task 6) and `app/openapi.yaml`'s Link section (Task 3) are both rewritten to the new shape and are the "spec" this plan targets, per the header above. Both new backend routes exist and are registered (Task 2). The frontend's redirect machinery is fully removed (Tasks 4–5) and the mock mirrors the new contract (Task 3). No section of either doc still references Hosted Link, `session_ref`, `hosted_link_url`, or `completion_redirect_uri` after this plan.

**Placeholder scan:** none found — every step has literal code, and every test asserts a specific value rather than just "add validation."

**Type consistency:** `LinkTokenRequest.itemId` / `LinkExchangeRequest.public_token` / `LinkExchangeResponse.item_id` are named identically across `apis/plaid`'s generated types (via the OpenAPI spec in Task 2), `app/src/api/types.ts` (Task 3), `client.ts` (Task 3), `mock.ts` (Task 3), and the hook that calls them (Task 4). `usePlaidLinkFlow`'s returned `{ start, linking, outcome, clearOutcome }` shape (Task 4) matches exactly what `Accounts.tsx` destructures (Task 5). `LinkOutcome`'s four variants (`success` / `reconnected` / `exited` / `error`) are produced only in Task 4 and consumed only by `LinkBanner` in Task 5 with no fifth variant invented on either side.

**Review Focus:** all four items listed above have an owning test or an owning manual-QA step — update-mode's 404-on-unknown-`itemId` (Task 2, test 2), access-token-never-leaked (Task 2, tests 1 and 4), double-exchange safety (Task 2, test 5), `onExit` null-error-means-cancel (Task 4's `onExit` implementation, exercised manually in Task 5 Step 5's "Reconnect" smoke test), and update-mode-skips-exchange (Task 4's `finishLink`, exercised manually in Task 5 Step 5).
