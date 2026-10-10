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

function exitMessage(error: PlaidLinkError): string {
  return error.error_message || error.display_message || 'Link closed with an error.';
}

/** `onExit` fires with `error: null` on a plain user-initiated close — that's a cancel, not a failure. */
export function exitOutcome(error: PlaidLinkError | null): LinkOutcome {
  return error ? { kind: 'error', message: exitMessage(error) } : { kind: 'exited' };
}

/** Update-mode Link doesn't mint a new access token, so there is nothing to exchange. */
export function shouldExchangeOnSuccess(mode: 'new' | 'update'): boolean {
  return mode === 'new';
}

/**
 * `usePlaidLink` loads Plaid's script unconditionally; if that load fails
 * (offline, blocked), its `error` becomes non-null and `ready` never turns
 * true, so `open()` is never called. Without this, the caller is left
 * showing "Opening Plaid…" forever with no way out but a reload.
 */
export function scriptLoadErrorOutcome(error: ErrorEvent | null): LinkOutcome | null {
  if (!error) return null;
  return { kind: 'error', message: "Couldn't load Plaid Link. Check your connection and try again." };
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
    if (!shouldExchangeOnSuccess(modeRef.current)) {
      setOutcome({ kind: 'reconnected' });
    } else {
      try {
        await api.exchangeLinkToken({ publicToken });
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
    setOutcome(exitOutcome(error));
  }, []);

  const { open, ready, error: scriptError } = usePlaidLink({
    token: isMock ? null : token,
    onSuccess,
    onExit,
  });

  useEffect(() => {
    if (!isMock && ready && token) open();
  }, [ready, token, open]);

  // A failed script load leaves `ready` false forever with no other signal.
  useEffect(() => {
    if (isMock || !token) return;
    const failure = scriptLoadErrorOutcome(scriptError);
    if (failure) {
      setOutcome(failure);
      setLinking(null);
      setToken(null);
    }
  }, [scriptError, token]);

  return { start, linking, outcome, clearOutcome: () => setOutcome(null) };
}
