import type { Request, Response } from 'express';
import { createApp } from '../server/app.js';

const app = createApp();

/**
 * Synchronous Vercel Serverless Function entrypoint wrapping the Express app.
 * Note: Must NOT be `async` returning `app(req, res)` directly, otherwise the
 * Promise resolves before Express reads the request body and calls `res.end()`.
 */
export default function handler(req: Request, res: Response) {
  if (!req.url) {
    req.url = '/api';
  } else if (!req.url.startsWith('/api')) {
    req.url = `/api${req.url === '/' ? '' : req.url}`;
  }
  return app(req, res);
}
