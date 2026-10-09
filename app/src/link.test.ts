import { describe, expect, it } from 'vitest';
import { exitOutcome, scriptLoadErrorOutcome, shouldExchangeOnSuccess } from './link';
import type { PlaidLinkError } from 'react-plaid-link';

function plaidError(overrides: Partial<PlaidLinkError>): PlaidLinkError {
  return {
    error_type: 'API_ERROR',
    error_code: 'INTERNAL_SERVER_ERROR',
    error_message: '',
    display_message: null,
    ...overrides,
  };
}

describe('exitOutcome', () => {
  it('maps a plain user-initiated close (no error) to exited, not error', () => {
    expect(exitOutcome(null)).toEqual({ kind: 'exited' });
  });

  it('maps a Link error to an error outcome carrying its message', () => {
    const error = plaidError({ error_message: 'boom' });
    expect(exitOutcome(error)).toEqual({ kind: 'error', message: 'boom' });
  });

  it('falls back to display_message when error_message is empty', () => {
    const error = plaidError({ error_message: '', display_message: 'Something went wrong.' });
    expect(exitOutcome(error)).toEqual({ kind: 'error', message: 'Something went wrong.' });
  });
});

describe('shouldExchangeOnSuccess', () => {
  it('exchanges the public token for a new Item', () => {
    expect(shouldExchangeOnSuccess('new')).toBe(true);
  });

  it('skips the exchange for update mode (reconnect never mints a new access token)', () => {
    expect(shouldExchangeOnSuccess('update')).toBe(false);
  });
});

describe('scriptLoadErrorOutcome', () => {
  it('is null when there is no script-load error', () => {
    expect(scriptLoadErrorOutcome(null)).toBeNull();
  });

  it('surfaces a recoverable error instead of leaving Link stuck on "Opening Plaid…"', () => {
    // vitest's default (node) environment has no ErrorEvent global; the
    // function only checks truthiness, so a minimal stand-in is enough.
    const fakeScriptError = {} as ErrorEvent;
    const outcome = scriptLoadErrorOutcome(fakeScriptError);
    expect(outcome).toEqual({ kind: 'error', message: expect.stringContaining('Plaid Link') });
  });
});
