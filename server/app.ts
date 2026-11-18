import express from 'express';
import { ensureServerlessBootstrap } from './bootstrap.js';
import { decryptVaultBytes, encryptVaultBytes } from './crypto.js';
import {
  bumpVaultRev,
  ensureDbReady,
  exportDatabaseBytes,
  getVaultRev,
  isServerlessRuntime,
  isSqlJsActive,
  replaceDatabaseBytes,
} from './db.js';
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

  app.use('/api', async (req, res, next) => {
    try {
      await ensureAppReady();

      // Synchronize SQLite state across ephemeral Vercel Lambda containers
      if ((isServerlessRuntime() || process.env.XC_FORCE_SQLJS === '1') && isSqlJsActive() && !req.path.startsWith('/webhook/')) {
        const incomingVault = typeof req.headers['x-xc-vault'] === 'string' ? req.headers['x-xc-vault'] : '';
        const incomingRev = typeof req.headers['x-xc-vault-rev'] === 'string' ? req.headers['x-xc-vault-rev'] : '';

        if (incomingVault) {
          if (!incomingRev || incomingRev !== getVaultRev()) {
            try {
              const rawBytes = decryptVaultBytes(incomingVault);
              replaceDatabaseBytes(rawBytes);
            } catch {
              res.setHeader('X-XC-Vault-Reset', '1');
            }
          }
        } else if (incomingRev && incomingRev !== getVaultRev()) {
          res.status(409).json({
            code: 'VAULT_SYNC_REQUIRED',
            error: 'Synchronizing workspace state...',
          });
          return;
        }

        const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
        if (isMutating) {
          const origJson = res.json.bind(res);
          res.json = ((body: unknown) => {
            if (
              res.statusCode < 400 &&
              body &&
              typeof body === 'object' &&
              !Array.isArray(body) &&
              req.path !== '/auth/logout'
            ) {
              const nextRev = bumpVaultRev();
              const raw = exportDatabaseBytes();
              if (raw) {
                const payload = {
                  ...(body as Record<string, unknown>),
                  _vault: encryptVaultBytes(raw),
                  _vaultRev: nextRev,
                };
                return origJson(payload);
              }
            }
            return origJson(body);
          }) as typeof res.json;
        }
      }

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
