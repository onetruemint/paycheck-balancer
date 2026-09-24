// In-browser mock of the StateMint API so the app can be demoed with no backend.
// All numbers are static fixtures — the mock does NOT implement the funding
// calculation; it just returns plausible pre-computed results.

import type {
  Account,
  CurrentSnapshotResponse,
  Institution,
  ManualCard,
  Snapshot,
  SnapshotItem,
  StateMintApi,
} from './types';

export const MOCK_SCENARIOS = ['default', 'item_failure', 'empty', 'no_paycheck'] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

const SCENARIO_KEY = 'statemint.mockScenario';
// Mock state is persisted so it survives the full-page Hosted Link redirect.
const WORLD_KEY = 'statemint.mockWorld';

export function getMockScenario(): MockScenario {
  const fromUrl = new URLSearchParams(location.search).get('mock');
  if (fromUrl && (MOCK_SCENARIOS as readonly string[]).includes(fromUrl)) {
    localStorage.setItem(SCENARIO_KEY, fromUrl);
    return fromUrl as MockScenario;
  }
  const stored = localStorage.getItem(SCENARIO_KEY);
  if (stored && (MOCK_SCENARIOS as readonly string[]).includes(stored)) return stored as MockScenario;
  const fromEnv = import.meta.env.VITE_MOCK_SCENARIO ?? '';
  return (MOCK_SCENARIOS as readonly string[]).includes(fromEnv) ? (fromEnv as MockScenario) : 'default';
}

export function setMockScenario(scenario: MockScenario) {
  localStorage.setItem(SCENARIO_KEY, scenario);
  localStorage.removeItem(WORLD_KEY);
}

// ---------- fixture helpers ----------

const pad = (n: number) => String(n).padStart(2, '0');

function monthKey(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function dayIn(key: string, day: number): string {
  return `${key}-${pad(day)}`;
}

function isoAt(key: string, day: number, hour = 7): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, day, hour, 12).toISOString();
}

function card(
  id: string,
  name: string,
  institution: string,
  mask: string,
  owed: number,
  funded: number,
  statement: number,
  due: string,
  status: SnapshotItem['status'],
  kind: SnapshotItem['kind'] = 'card',
): SnapshotItem {
  return {
    id,
    kind,
    name,
    institution_name: institution,
    mask,
    owed_cents: owed,
    funded_cents: funded,
    statement_balance_cents: statement,
    due_date: due,
    status,
    error: null,
  };
}

function target(
  id: string,
  name: string,
  current: number,
  targetBal: number,
  owed: number,
  funded: number,
  status: SnapshotItem['status'],
): SnapshotItem {
  return {
    id,
    kind: 'target',
    name,
    institution_name: 'Ally Bank',
    mask: '7731',
    owed_cents: owed,
    funded_cents: funded,
    current_balance_cents: current,
    target_balance_cents: targetBal,
    status,
    error: null,
  };
}

function snapshotFor(key: string, variant: number, failing = false): Snapshot {
  const v = variant;
  const items: SnapshotItem[] = [
    card('acc_sapphire', 'Sapphire Preferred', 'Chase', '4412', 84_217 + v * 3_100, 84_217 + v * 3_100, 84_217 + v * 3_100, dayIn(key, 8), 'due'),
    failing
      ? {
          id: 'acc_amex_gold',
          kind: 'card',
          name: 'Gold Card',
          institution_name: 'American Express',
          mask: '1009',
          owed_cents: null,
          funded_cents: null,
          statement_balance_cents: null,
          due_date: null,
          status: null,
          error: {
            code: 'ITEM_LOGIN_REQUIRED',
            message: 'American Express needs to be reconnected.',
            institution_id: 'item_amex',
          },
        }
      : card('acc_amex_gold', 'Gold Card', 'American Express', '1009', 31_050 - v * 1_200, 31_050 - v * 1_200, 52_050, dayIn(key, 14), v === 2 ? 'overdue' : 'partially_paid'),
    card('mc_costco', 'Costco Citi', 'Citi (manual)', '8830', 12_999, 12_999, 12_999, dayIn(key, 21), 'due', 'manual_card'),
    card('acc_freedom', 'Freedom Unlimited', 'Chase', '0021', 0, 0, 4_560, dayIn(key, 25), 'paid'),
    target('acc_ally_savings', 'Emergency Fund', 1_150_000 + v * 25_000, 1_500_000, 60_000, 40_000 - v * 2_500, 'below_target'),
  ];
  const transfer = items.reduce((sum, i) => sum + (i.funded_cents ?? 0), 0);
  return {
    month_key: key,
    computed_at: isoAt(key, 2 + (v % 3)),
    paycheck_amount_cents: 412_388,
    transfer_cents: transfer,
    detail: {
      version: 1,
      paycheck: {
        account_id: 'acc_checking',
        account_name: 'Total Checking',
        transaction_id: `txn_${key}`,
        amount_cents: 412_388,
        date: dayIn(key, 1 + (v % 3)),
      },
      items,
    },
  };
}

function institutions(failing: boolean): Institution[] {
  return [
    { id: 'item_chase', plaid_institution_id: 'ins_3', name: 'Chase', status: 'healthy', status_detail: null, last_success_at: new Date().toISOString() },
    failing
      ? { id: 'item_amex', plaid_institution_id: 'ins_10', name: 'American Express', status: 'needs_reconnect', status_detail: 'ITEM_LOGIN_REQUIRED', last_success_at: isoAt(monthKey(1), 3) }
      : { id: 'item_amex', plaid_institution_id: 'ins_10', name: 'American Express', status: 'healthy', status_detail: null, last_success_at: new Date().toISOString() },
    { id: 'item_ally', plaid_institution_id: 'ins_25', name: 'Ally Bank', status: 'healthy', status_detail: null, last_success_at: new Date().toISOString() },
  ];
}

function accounts(): Account[] {
  const a = (
    id: string,
    institution_id: string,
    institution_name: string,
    name: string,
    mask: string,
    type: string,
    subtype: string,
    bal: number,
    role: Account['role'],
    targetBal: number | null = null,
  ): Account => ({
    id,
    institution_id,
    institution_name,
    name,
    official_name: null,
    mask,
    type,
    subtype,
    current_balance_cents: bal,
    role,
    target_balance_cents: targetBal,
  });
  return [
    a('acc_checking', 'item_chase', 'Chase', 'Total Checking', '5520', 'depository', 'checking', 523_410, 'paycheck'),
    a('acc_sapphire', 'item_chase', 'Chase', 'Sapphire Preferred', '4412', 'credit', 'credit card', 91_802, 'card'),
    a('acc_freedom', 'item_chase', 'Chase', 'Freedom Unlimited', '0021', 'credit', 'credit card', 4_560, 'card'),
    a('acc_amex_gold', 'item_amex', 'American Express', 'Gold Card', '1009', 'credit', 'credit card', 58_760, 'card'),
    a('acc_ally_bills', 'item_ally', 'Ally Bank', 'Bills', '2208', 'depository', 'checking', 20_000, 'payment'),
    a('acc_ally_savings', 'item_ally', 'Ally Bank', 'Emergency Fund', '7731', 'depository', 'savings', 1_150_000, 'target', 1_500_000),
    a('acc_ally_old', 'item_ally', 'Ally Bank', 'Old Joint', '9014', 'depository', 'savings', 1_204, 'ignored'),
  ];
}

function manualCards(): ManualCard[] {
  const key = monthKey(0);
  return [
    {
      id: 'mc_costco',
      name: 'Costco Citi',
      statement_balance_cents: 12_999,
      statement_date: dayIn(monthKey(1), 26),
      due_date: dayIn(key, 21),
      statement_day: 26,
      paid: false,
      linked_account_id: 'acc_ally_bills',
      updated_at: isoAt(key, 1),
    },
  ];
}

// ---------- mock world ----------

interface World {
  institutions: Institution[];
  accounts: Account[];
  manualCards: ManualCard[];
  snapshots: Snapshot[]; // stored rows, any order
  pendingCurrent: CurrentSnapshotResponse;
}

function buildWorld(scenario: MockScenario): World {
  if (scenario === 'empty') {
    return {
      institutions: [],
      accounts: [],
      manualCards: [],
      snapshots: [],
      pendingCurrent: { state: 'no_accounts' },
    };
  }
  const failing = scenario === 'item_failure';
  const history = [1, 2, 3, 4, 5].map((o) => snapshotFor(monthKey(o), o));
  const current: CurrentSnapshotResponse =
    scenario === 'no_paycheck'
      ? {
          state: 'no_paycheck',
          month_key: monthKey(0),
          message: 'No deposit found in Total Checking ••5520 in the last 5 days.',
        }
      : { state: 'ready', snapshot: snapshotFor(monthKey(0), 0, failing), persisted: !failing };
  return {
    institutions: institutions(failing),
    accounts: accounts(),
    manualCards: manualCards(),
    snapshots: history,
    pendingCurrent: current,
  };
}

const delay = (ms = 450) => new Promise((r) => setTimeout(r, ms + Math.random() * 250));
const clone = <T,>(v: T): T => structuredClone(v);

function notFound(what: string): never {
  throw Object.assign(new Error(`${what} not found`), { status: 404, code: 'NOT_FOUND' });
}

function loadWorld(scenario: MockScenario): World {
  try {
    const raw = localStorage.getItem(WORLD_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { scenario: MockScenario; month: string; world: World };
      if (saved.scenario === scenario && saved.month === monthKey(0)) return saved.world;
    }
  } catch {
    // Corrupt state: fall through and rebuild.
  }
  return buildWorld(scenario);
}

export function createMockApi(): StateMintApi {
  let scenario = getMockScenario();
  let world = loadWorld(scenario);
  let idSeq = Date.now() % 100_000;

  const save = () =>
    localStorage.setItem(WORLD_KEY, JSON.stringify({ scenario, month: monthKey(0), world }));

  const api: StateMintApi = {
    async resolveCurrentSnapshot() {
      await delay(700);
      const key = monthKey(0);
      const stored = world.snapshots.find((s) => s.month_key === key);
      if (stored) return { state: 'ready', snapshot: clone(stored), persisted: true };
      const result = world.pendingCurrent;
      // Mimic INSERT ... ON CONFLICT DO NOTHING: only persist clean results.
      if (result.state === 'ready' && result.persisted) world.snapshots.push(clone(result.snapshot));
      return clone(result);
    },

    async listSnapshots({ limit = 24, before } = {}) {
      await delay();
      const sorted = [...world.snapshots]
        .sort((a, b) => b.month_key.localeCompare(a.month_key))
        .filter((s) => !before || s.month_key < before);
      const page = sorted.slice(0, limit);
      return {
        snapshots: clone(page),
        next_before: sorted.length > limit ? page[page.length - 1].month_key : null,
      };
    },

    async getSnapshot(key) {
      await delay();
      const s = world.snapshots.find((x) => x.month_key === key);
      return s ? clone(s) : notFound('Snapshot');
    },

    async listAccounts() {
      await delay();
      return clone(world.accounts);
    },

    async updateAccount(id, update) {
      await delay(250);
      const acct = world.accounts.find((a) => a.id === id) ?? notFound('Account');
      if (update.role !== undefined) acct.role = update.role;
      if (update.target_balance_cents !== undefined) acct.target_balance_cents = update.target_balance_cents;
      return clone(acct);
    },

    async listManualCards() {
      await delay();
      return clone(world.manualCards);
    },

    async createManualCard(input) {
      await delay(250);
      const card: ManualCard = { ...input, id: `mc_new_${idSeq++}`, updated_at: new Date().toISOString() };
      world.manualCards.push(card);
      return clone(card);
    },

    async updateManualCard(id, input) {
      await delay(250);
      const idx = world.manualCards.findIndex((c) => c.id === id);
      if (idx < 0) notFound('Manual card');
      world.manualCards[idx] = { ...input, id, updated_at: new Date().toISOString() };
      return clone(world.manualCards[idx]);
    },

    async deleteManualCard(id) {
      await delay(250);
      world.manualCards = world.manualCards.filter((c) => c.id !== id);
    },

    async listInstitutions() {
      await delay();
      return clone(world.institutions);
    },

    async createLinkToken(req) {
      await delay(300);
      const token = `link-sandbox-mock-${req.mode}-${req.institution_id ?? 'new'}-${Date.now()}`;
      // Skip the real Plaid page: "Hosted Link" immediately redirects back.
      return {
        link_token: token,
        hosted_link_url: req.completion_redirect_uri,
        expiration: new Date(Date.now() + 4 * 3600_000).toISOString(),
      };
    },

    async completeLink(linkToken) {
      await delay(800);
      const [, , , mode, ...rest] = linkToken.split('-');
      if (mode === 'update') {
        const itemId = rest.slice(0, -1).join('-');
        const inst = world.institutions.find((i) => i.id === itemId) ?? notFound('Institution');
        inst.status = 'healthy';
        inst.status_detail = null;
        inst.last_success_at = new Date().toISOString();
        // A repaired Item means the next open can compute a clean snapshot.
        if (world.pendingCurrent.state === 'ready') {
          world.pendingCurrent = { state: 'ready', snapshot: snapshotFor(monthKey(0), 0), persisted: true };
        }
        return { status: 'success', institution: clone(inst) };
      }
      // New link: in the empty scenario, jump to the populated demo world.
      if (scenario === 'empty') {
        scenario = 'default';
        setMockScenario(scenario);
        world = buildWorld(scenario);
        return { status: 'success', institution: clone(world.institutions[0]) };
      }
      const inst: Institution = {
        id: `item_new_${idSeq++}`,
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
        mask: '6614',
        type: 'credit',
        subtype: 'credit card',
        current_balance_cents: 23_410,
        role: 'ignored',
        target_balance_cents: null,
      });
      return { status: 'success', institution: clone(inst) };
    },
  };

  // Persist after every call (cheap; the world is tiny).
  const wrapped = {} as Record<string, unknown>;
  for (const [name, fn] of Object.entries(api) as [string, (...a: unknown[]) => Promise<unknown>][]) {
    wrapped[name] = async (...args: unknown[]) => {
      const result = await fn(...args);
      save();
      return result;
    };
  }
  return wrapped as unknown as StateMintApi;
}
