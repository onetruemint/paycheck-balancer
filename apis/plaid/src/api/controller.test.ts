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
