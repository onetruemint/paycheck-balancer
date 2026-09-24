import type {
  Account,
  AccountUpdate,
  ApiError,
  CurrentSnapshotResponse,
  Institution,
  LinkCompleteResponse,
  LinkTokenRequest,
  LinkTokenResponse,
  ManualCard,
  ManualCardInput,
  MonthKey,
  Snapshot,
  SnapshotList,
  StateMintApi,
} from './types';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, body: Partial<ApiError> | null) {
    super(body?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.code;
  }
}

export function createHttpApi(baseUrl: string): StateMintApi {
  const base = baseUrl.replace(/\/$/, '');

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON body (e.g. proxy error page).
    }
    if (!res.ok) throw new ApiRequestError(res.status, json as Partial<ApiError> | null);
    return json as T;
  }

  const enc = encodeURIComponent;

  return {
    resolveCurrentSnapshot: () =>
      request<CurrentSnapshotResponse>('POST', '/api/snapshots/current'),

    listSnapshots: (params = {}) => {
      const q = new URLSearchParams();
      if (params.limit) q.set('limit', String(params.limit));
      if (params.before) q.set('before', params.before);
      const qs = q.toString();
      return request<SnapshotList>('GET', `/api/snapshots${qs ? `?${qs}` : ''}`);
    },

    getSnapshot: (monthKey: MonthKey) =>
      request<Snapshot>('GET', `/api/snapshots/${enc(monthKey)}`),

    listAccounts: async () =>
      (await request<{ accounts: Account[] }>('GET', '/api/accounts')).accounts,

    updateAccount: (accountId: string, update: AccountUpdate) =>
      request<Account>('PATCH', `/api/accounts/${enc(accountId)}`, update),

    listManualCards: async () =>
      (await request<{ cards: ManualCard[] }>('GET', '/api/manual-cards')).cards,

    createManualCard: (input: ManualCardInput) =>
      request<ManualCard>('POST', '/api/manual-cards', input),

    updateManualCard: (cardId: string, input: ManualCardInput) =>
      request<ManualCard>('PUT', `/api/manual-cards/${enc(cardId)}`, input),

    deleteManualCard: (cardId: string) =>
      request<void>('DELETE', `/api/manual-cards/${enc(cardId)}`),

    listInstitutions: async () =>
      (await request<{ institutions: Institution[] }>('GET', '/api/institutions')).institutions,

    createLinkToken: (req: LinkTokenRequest) =>
      request<LinkTokenResponse>('POST', '/api/link/token', req),

    completeLink: (linkToken: string) =>
      request<LinkCompleteResponse>('POST', '/api/link/complete', { link_token: linkToken }),
  };
}
