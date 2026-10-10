import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import {
  ItemPublicTokenExchangeRequest,
  LinkTokenCreateRequest,
  PlaidApi,
  Products,
} from 'plaid';
import { isAxiosError } from 'axios';
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

interface PlaidErrorBody {
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
}

function plaidError(e: unknown): ApiError {
  if (e instanceof RequiredError) {
    return { code: 'VALIDATION', message: e.message };
  }
  if (isAxiosError(e) && e.response?.data) {
    const data = e.response.data as PlaidErrorBody;
    if (data.error_code) {
      const detail = data.display_message || data.error_message || e.message;
      return { code: 'PLAID_ERROR', message: `${data.error_code}: ${detail}` };
    }
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
    } else {
      // Plaid's own guidance: omit `products` (and anything product-specific,
      // like `statements`) in update mode unless deliberately adding a product
      // to an existing Item — which this app never does.
      configs.products = config.products;
      if (config.products.includes(Products.Statements)) {
        configs.statements = {
          start_date: moment().subtract(30, 'days').format('YYYY-MM-DD'),
          end_date: moment().format('YYYY-MM-DD'),
        };
      }
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
