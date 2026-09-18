import Fastify, { FastifyInstance } from 'fastify';
import PlaidRouter from './api/router.js';
import { getEnvVar } from '@paycheck-balancer/core';
import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from 'plaid';
import cors from '@fastify/cors';
import { ConfigDecorator, Decorators } from './utils/utils.js';
import dotenv from 'dotenv';
import formbody from '@fastify/formbody';

dotenv.config();

const PLAID_CLIENT_ID = getEnvVar('PLAID_CLIENT_ID');
const PLAID_ENV = getEnvVar('PLAID_ENV', {
  default: 'sandbox',
});
const PLAID_SECRET =
  PLAID_ENV === 'sandbox'
    ? getEnvVar('PLAID_SANDBOX_SECRET')
    : getEnvVar('PLAID_PROD_SECRET');

const PLAID_PRODUCTS = getEnvVar('PLAID_PRODUCTS', {
  default: Products.Transactions,
}).split(',') as Products[];

const PLAID_COUNTRY_CODES = getEnvVar('PLAID_COUNTRY_CODES', {
  default: 'US',
}).split(',') as CountryCode[];

const PLAID_VERSION = getEnvVar('PLAID_VERSION', { default: '2020-09-14' });
const PLAID_ANDROID_PACKAGE_NAME = getEnvVar('PLAID_ANDROID_PACKAGE_NAME', {
  default: '',
});

export default function PlaidApp(): FastifyInstance {
  const plaidConfig = new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
        'PLAID-SECRET': PLAID_SECRET,
        'Plaid-Version': PLAID_VERSION,
      },
    },
  });

  const appConfig: ConfigDecorator = {
    products: PLAID_PRODUCTS,
    countryCodes: PLAID_COUNTRY_CODES,
    androidPackageName: PLAID_ANDROID_PACKAGE_NAME,
  };

  const client = new PlaidApi(plaidConfig);

  const app = Fastify({
    logger: true,
  });

  app.register(formbody);
  app.register(cors, {}); // TODO: Update cors body

  app.decorate(Decorators.GET_CLIENT, client);
  app.decorate(Decorators.GET_CONFIG, appConfig);

  app.register(PlaidRouter);

  return app;
}
