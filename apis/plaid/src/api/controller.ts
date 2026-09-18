import { ConfigDecorator } from './../utils/utils.js';
import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import {
  ItemPublicTokenExchangeRequest,
  LinkTokenCreateRequest,
  PlaidApi,
  Products,
} from 'plaid';
import { Decorators } from '../utils/utils.js';
import moment from 'moment';
import { RequiredError } from 'plaid/dist/base.js';
import {
  CreateLinkTokenRequest,
  PlaidClientError,
  PublicTokenExchangeRequest,
  PublicTokenExchangeResponse,
} from '../generated/index.js';

export async function getHealth(request: FastifyRequest, reply: FastifyReply) {
  reply.send('Server is alive and well!');
}

export function createLinkToken(client: PlaidApi, fastify: FastifyInstance) {
  const config: ConfigDecorator = fastify.getDecorator(Decorators.GET_CONFIG);
  return async (
    request: FastifyRequest<{ Body: CreateLinkTokenRequest }>,
    reply: FastifyReply
  ) => {
    const { clientId, redirectUri } = request.body;

    const configs: LinkTokenCreateRequest = {
      user: {
        client_user_id: clientId,
      },
      client_name: 'Paycheck Balancer',
      country_codes: config.countryCodes,
      language: 'en',
      products: config.products,
    };

    if (redirectUri !== '') {
      configs.redirect_uri = redirectUri;
    }

    if (config.products.includes(Products.Statements)) {
      const statementConfig = {
        start_date: moment().subtract(30, 'days').format('YYYY-MM-DD'),
        end_date: moment().format('YYYY-MM-DD'),
      };

      configs.statements = statementConfig;
    }

    try {
      const createTokenRes = await client.linkTokenCreate(configs);
      reply.send(createTokenRes.data);
    } catch (e: unknown) {
      if (e instanceof RequiredError) {
        reply.code(400).send({
          err: e.message,
        });
      } else {
        reply.code(400).send({
          err: e,
        });
      }
    }
  };
}

// TODO: Must secure access tokens in database
export function getAccessToken(client: PlaidApi) {
  return async function (
    request: FastifyRequest<{ Body: PublicTokenExchangeRequest }>,
    reply: FastifyReply<{
      Reply: PublicTokenExchangeResponse | PlaidClientError;
    }>
  ) {
    const { publicToken } = request.body;
    const req: ItemPublicTokenExchangeRequest = {
      public_token: publicToken,
    };
    try {
      const res = await client.itemPublicTokenExchange(req);
      const { access_token, item_id } = res.data;
      reply.send({
        access_token,
        item_id,
      });
    } catch (e: unknown) {
      if (e instanceof RequiredError) {
        return reply.code(400).send({
          err: e.message,
        });
      }
      reply.code(400).send({
        err: Object(e),
      });
    }
  };
}
