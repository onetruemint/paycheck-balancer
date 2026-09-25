// Hand-written types mirroring app/openapi.yaml. Keep the two in sync.
// All money values are integer cents; dates are YYYY-MM-DD strings.

export type MonthKey = string;

export interface ApiError {
  code?: string;
  message: string;
}

export type ItemKind = 'card' | 'manual_card' | 'target';

export type ItemStatus =
  | 'paid'
  | 'partially_paid'
  | 'due'
  | 'overdue'
  | 'no_statement'
  | 'at_target'
  | 'below_target';

export interface ItemError {
  code: string;
  message: string;
  institution_id?: string | null;
}

export interface SnapshotItem {
  id: string;
  kind: ItemKind;
  name: string;
  institution_name?: string | null;
  mask?: string | null;
  owed_cents: number | null;
  funded_cents: number | null;
  statement_balance_cents?: number | null;
  due_date?: string | null;
  current_balance_cents?: number | null;
  target_balance_cents?: number | null;
  status: ItemStatus | null;
  error: ItemError | null;
}

export interface PaycheckPick {
  account_id: string;
  account_name?: string;
  transaction_id?: string;
  amount_cents: number;
  date: string;
}

export interface SnapshotDetail {
  version: 1;
  paycheck?: PaycheckPick | null;
  items: SnapshotItem[];
}

export interface Snapshot {
  month_key: MonthKey;
  computed_at: string;
  paycheck_amount_cents: number;
  transfer_cents: number;
  detail: SnapshotDetail;
}

export type CurrentSnapshotResponse =
  | { state: 'ready'; snapshot: Snapshot; persisted: boolean }
  | { state: 'no_accounts' }
  | { state: 'no_paycheck'; month_key: MonthKey; message?: string };

export interface SnapshotList {
  snapshots: Snapshot[];
  next_before?: MonthKey | null;
}

export type AccountRole = 'paycheck' | 'payment' | 'target' | 'card' | 'ignored';

export interface Account {
  id: string;
  institution_id: string;
  institution_name?: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  type: string;
  subtype?: string | null;
  current_balance_cents: number | null;
  role: AccountRole;
  target_balance_cents: number | null;
}

export interface AccountUpdate {
  role?: AccountRole;
  target_balance_cents?: number | null;
}

export interface ManualCardInput {
  name: string;
  statement_balance_cents: number;
  statement_date: string | null;
  due_date: string | null;
  statement_day: number | null;
  paid: boolean;
  linked_account_id: string | null;
}

export interface ManualCard extends ManualCardInput {
  id: string;
  updated_at: string;
}

export type InstitutionStatus = 'healthy' | 'needs_reconnect' | 'error';

export interface Institution {
  id: string;
  plaid_institution_id?: string | null;
  name: string;
  status: InstitutionStatus;
  status_detail?: string | null;
  last_success_at?: string | null;
}

export interface LinkTokenRequest {
  mode: 'new' | 'update';
  institution_id?: string;
  completion_redirect_uri: string;
  /** Client-generated id, also embedded in completion_redirect_uri. */
  session_ref: string;
}

export interface LinkTokenResponse {
  link_token: string;
  hosted_link_url: string;
  expiration: string;
}

/** Identify the session by link_token (preferred) or by session_ref (fallback). */
export type LinkCompleteRequest = { link_token: string } | { session_ref: string };

export interface LinkCompleteResponse {
  status: 'success' | 'exited' | 'pending';
  institution?: Institution | null;
}

/** The full surface the UI depends on. Implemented by the HTTP client and the mock. */
export interface StateMintApi {
  resolveCurrentSnapshot(): Promise<CurrentSnapshotResponse>;
  listSnapshots(params?: { limit?: number; before?: MonthKey }): Promise<SnapshotList>;
  getSnapshot(monthKey: MonthKey): Promise<Snapshot>;
  listAccounts(): Promise<Account[]>;
  updateAccount(accountId: string, update: AccountUpdate): Promise<Account>;
  listManualCards(): Promise<ManualCard[]>;
  createManualCard(input: ManualCardInput): Promise<ManualCard>;
  updateManualCard(cardId: string, input: ManualCardInput): Promise<ManualCard>;
  deleteManualCard(cardId: string): Promise<void>;
  listInstitutions(): Promise<Institution[]>;
  createLinkToken(req: LinkTokenRequest): Promise<LinkTokenResponse>;
  completeLink(req: LinkCompleteRequest): Promise<LinkCompleteResponse>;
}
