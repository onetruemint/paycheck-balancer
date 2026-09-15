import { getEnvVar } from '@paycheck-balancer/core/src/index.js';
import PlaidApp from './app.js';

const PLAID_APP_PORT = Number(getEnvVar('PLAID_API_PORT'));

PlaidApp().listen({
  port: PLAID_APP_PORT,
});
