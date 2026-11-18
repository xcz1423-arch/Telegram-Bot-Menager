import express from 'express';
import { ensureServerlessBootstrap } from './bootstrap';
import { apiRateLimiter, securityHeaders } from './security';
import { apiRouter } from './routes';

export function createApp() {
  ensureServerlessBootstrap();

  const app = express();
  app.set('trust proxy', 1);
  app.use(securityHeaders);
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', apiRateLimiter, apiRouter);

  return app;
}
