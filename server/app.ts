import express from 'express';
import { ensureServerlessBootstrap } from './bootstrap.js';
import { ensureDbReady } from './db.js';
import { apiRateLimiter, securityHeaders } from './security.js';
import { apiRouter } from './routes.js';

let appReadyPromise: Promise<void> | null = null;

export async function ensureAppReady(): Promise<void> {
  if (!appReadyPromise) {
    appReadyPromise = (async () => {
      await ensureDbReady();
      ensureServerlessBootstrap();
    })().catch((err) => {
      appReadyPromise = null;
      throw err;
    });
  }
  await appReadyPromise;
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(securityHeaders);
  app.use(express.json({ limit: '2mb' }));

  app.use('/api', async (_req, res, next) => {
    try {
      await ensureAppReady();
      next();
    } catch (err) {
      console.error('[XC BOT CONTROL] Initialization failed:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Server initialization failed.',
      });
    }
  });

  app.use('/api', apiRateLimiter, apiRouter);

  return app;
}
