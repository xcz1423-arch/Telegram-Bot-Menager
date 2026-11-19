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
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/og-html', (req, res) => {
    const proto =
      String(req.headers['x-forwarded-proto'] || req.protocol || 'https')
        .split(',')[0]
        .trim()
        .replace(/[^a-z]/gi, '') || 'https';
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const rawHost = (forwardedHost || String(req.get('host') || 'telegram-bot-manager.vercel.app')).replace(
      /[^a-zA-Z0-9.:-]/g,
      ''
    );
    const origin = `${proto}://${rawHost}`;
    const ogImage = `${origin}/og-preview.jpg`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>xᴄ ʙᴏᴛ ᴄᴏɴᴛʀᴏʟ — ᴀᴅᴠᴀɴᴄᴇᴅ ᴅᴇᴠᴇʟᴏᴘᴇʀ ᴄᴏɴsᴏʟᴇ</title>
    <meta name="description" content="One Dashboard. Complete Bot Control. Advanced Developer Console for managing multiple Telegram bots, webhooks, API explorer, and analytics." />
    <meta property="og:site_name" content="XC BOT CONTROL" />
    <meta property="og:title" content="XC BOT CONTROL — Advanced Developer Console" />
    <meta property="og:description" content="One Dashboard. Complete Bot Control. Advanced Developer Console for managing multiple Telegram bots, webhooks, API explorer, and analytics." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${origin}/" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:secure_url" content="${ogImage}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="XC BOT CONTROL Logo" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="XC BOT CONTROL — Advanced Developer Console" />
    <meta name="twitter:description" content="One Dashboard. Complete Bot Control. Advanced Developer Console for managing multiple Telegram bots, webhooks, API explorer, and analytics." />
    <meta name="twitter:image" content="${ogImage}" />
  </head>
  <body>
    <p>XC BOT CONTROL — Advanced Developer Console</p>
  </body>
</html>`);
  });

  app.use('/api', async (req, res, next) => {
    try {
      await ensureAppReady();

      // Synchronize SQLite state across ephemeral Vercel Lambda containers
      if ((isServerlessRuntime() || process.env.XC_FORCE_SQLJS === '1') && isSqlJsActive() && !req.path.startsWith('/webhook/')) {
        const bodyVault =
          req.body && typeof req.body === 'object' && !Array.isArray(req.body) && typeof (req.body as Record<string, unknown>)._vault === 'string'
            ? String((req.body as Record<string, unknown>)._vault)
            : '';
        if (bodyVault && req.body && typeof req.body === 'object') {
          delete (req.body as Record<string, unknown>)._vault;
        }
        const headerVault = typeof req.headers['x-xc-vault'] === 'string' ? req.headers['x-xc-vault'] : '';
        const incomingVault = bodyVault || headerVault;
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

        if (req.path === '/vault/sync' && req.method.toUpperCase() === 'POST') {
          res.json({ ok: true, rev: getVaultRev() });
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
              req.path !== '/auth/logout' &&
              req.path !== '/vault/sync'
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
