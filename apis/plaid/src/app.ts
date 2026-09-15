import Fastify, {FastifyInstance} from 'fastify';
import PlaidRouter from './api/router.js';

export default function PlaidApp(): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  app.register(PlaidRouter);

  return app;
}
