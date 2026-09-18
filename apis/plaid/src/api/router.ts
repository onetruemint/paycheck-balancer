import { FastifyInstance } from 'fastify';
import { type PlaidApi } from 'plaid';
import { createLinkToken, getHealth } from './controller.js';
import { Decorators } from '../utils/utils.js';

export default async function PlaidRouter(fastify: FastifyInstance) {
  const client: PlaidApi = fastify.getDecorator(Decorators.GET_CLIENT);

  fastify.post('/api/create_link_token', createLinkToken(client, fastify));
  fastify.get('/', getHealth);
}
