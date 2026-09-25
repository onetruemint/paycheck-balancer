import { api } from './api';
import type { LinkCompleteRequest, LinkCompleteResponse } from './api';

// Plaid Hosted Link redirect flow:
//   1. generate a session_ref and ask the API for a link token (new or update mode),
//      with a return URL that carries the session_ref
//   2. remember { link_token, session_ref } locally, then navigate the whole page to Plaid
//   3. Plaid redirects back to RETURN_PARAM; we hand the link_token (or, if local
//      storage didn't survive the trip, e.g. iOS standalone PWA, the session_ref from
//      the URL) to the API, which checks the session and exchanges it synchronously.

const PENDING_KEY = 'statemint.pendingLink';
const RETURN_PARAM = 'link_return';
const REF_PARAM = 'ref';

interface PendingLink {
  link_token: string;
  session_ref: string;
}

// crypto.randomUUID needs a secure context; getRandomValues works over plain-HTTP LAN too.
function newSessionRef(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function startLink(mode: 'new' | 'update', institutionId?: string) {
  const sessionRef = newSessionRef();
  const returnUrl = new URL(location.pathname, location.origin);
  returnUrl.searchParams.set(RETURN_PARAM, '1');
  returnUrl.searchParams.set(REF_PARAM, sessionRef);
  const { link_token, hosted_link_url } = await api.createLinkToken({
    mode,
    institution_id: institutionId,
    completion_redirect_uri: returnUrl.toString(),
    session_ref: sessionRef,
  });
  const pending: PendingLink = { link_token, session_ref: sessionRef };
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  location.assign(hosted_link_url);
}

// session_ref from the return URL, kept in memory so Retry works after the URL is cleaned.
let returnRef: string | null = null;

/**
 * Call once before first render. If Plaid just redirected back, strips the return
 * params, points the hash at Accounts, and reports that a session needs completing.
 */
export function consumeLinkReturn(): boolean {
  const url = new URL(location.href);
  if (!url.searchParams.has(RETURN_PARAM)) return false;
  returnRef = url.searchParams.get(REF_PARAM);
  url.searchParams.delete(RETURN_PARAM);
  url.searchParams.delete(REF_PARAM);
  url.hash = '/accounts';
  history.replaceState(null, '', url.toString());
  return true;
}

function readPending(): PendingLink | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingLink) : null;
  } catch {
    return null;
  }
}

/** localStorage is primary; the URL's session_ref is the fallback (or wins if they disagree). */
function pendingRequest(): LinkCompleteRequest | null {
  const stored = readPending();
  if (stored && (!returnRef || stored.session_ref === returnRef)) {
    return { link_token: stored.link_token };
  }
  return returnRef ? { session_ref: returnRef } : null;
}

export type LinkOutcome =
  | { kind: 'result'; result: LinkCompleteResponse }
  | { kind: 'no_session' }
  | { kind: 'error'; message: string };

let inflight: Promise<LinkOutcome> | null = null;

/**
 * Completes the pending Hosted Link session via the API (synchronous token exchange).
 * Concurrent calls share one request, so a double-mounted effect (React StrictMode)
 * can't exchange twice. The pending token is only discarded once the session is
 * settled (success / exited), so errors and "pending" can be retried.
 */
export function completePendingLink(): Promise<LinkOutcome> {
  inflight ??= (async (): Promise<LinkOutcome> => {
    const req = pendingRequest();
    if (!req) return { kind: 'no_session' };
    try {
      const result = await api.completeLink(req);
      if (result.status === 'success' || result.status === 'exited') {
        localStorage.removeItem(PENDING_KEY);
        returnRef = null;
      }
      return { kind: 'result', result };
    } catch (e) {
      return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
