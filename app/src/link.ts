import { api } from './api';
import type { LinkCompleteResponse } from './api';

// Plaid Hosted Link redirect flow:
//   1. ask the API for a link token (new or update mode) with our return URL
//   2. remember the token locally, then navigate the whole page to Plaid
//   3. Plaid redirects back to RETURN_PARAM; we hand the token to the API,
//      which checks the session and exchanges the token synchronously.

const PENDING_KEY = 'statemint.pendingLink';
const RETURN_PARAM = 'link_return';

export async function startLink(mode: 'new' | 'update', institutionId?: string) {
  const returnUrl = new URL(location.pathname, location.origin);
  returnUrl.searchParams.set(RETURN_PARAM, '1');
  const { link_token, hosted_link_url } = await api.createLinkToken({
    mode,
    institution_id: institutionId,
    completion_redirect_uri: returnUrl.toString(),
  });
  localStorage.setItem(PENDING_KEY, link_token);
  location.assign(hosted_link_url);
}

/**
 * Call once before first render. If Plaid just redirected back, strips the return
 * param, points the hash at Accounts, and reports that a session needs completing.
 */
export function consumeLinkReturn(): boolean {
  const url = new URL(location.href);
  if (!url.searchParams.has(RETURN_PARAM)) return false;
  url.searchParams.delete(RETURN_PARAM);
  url.hash = '/accounts';
  history.replaceState(null, '', url.toString());
  return true;
}

let completing: Promise<LinkCompleteResponse | null> | null = null;

/**
 * Completes the pending Hosted Link session via the API (synchronous token exchange).
 * Memoised so a double-mounted effect (React StrictMode) can't exchange twice.
 */
export function completePendingLink(): Promise<LinkCompleteResponse | null> {
  completing ??= (async () => {
    const token = localStorage.getItem(PENDING_KEY);
    if (!token) return null;
    try {
      return await api.completeLink(token);
    } finally {
      localStorage.removeItem(PENDING_KEY);
    }
  })();
  return completing;
}
