import 'dotenv/config';
import type { Request, Response } from 'express';
import { createApp, ensureAppReady } from '../server/app';

const app = createApp();

export default async function handler(req: Request, res: Response) {
  try {
    await ensureAppReady();
    return app(req, res);
  } catch (err) {
    console.error('[XC BOT CONTROL] Vercel function error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Internal server error',
      });
    }
  }
}
