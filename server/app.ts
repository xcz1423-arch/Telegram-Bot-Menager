import express from 'express';
import { ensureServerlessBootstrap } from './bootstrap.js';
import { isCloudSyncConfigured, pullCloudVault, pushCloudVault } from './cloudSync.js';
import { decryptVaultBytes, encryptVaultBytes } from './crypto.js';
import {
  bumpVaultRev,
  ensureDbReady,
  exportDatabaseBytes,
  getVaultRev,
  getVaultSeq,
  isServerlessRuntime,
  isSqlJsActive,
  parseVaultSeq,
  replaceDatabaseBytes,
} from './db.js';
import { apiRateLimiter, securityHeaders } from './security.js';
import { apiRouter } from './routes.js';

let appReadyPromise: Promise<void> | null = null;
let lastCloudPullAt = 0;
let lastCloudPushAt = 0;

export async function ensureAppReady(): Promise<void> {
  if (!appReadyPromise) {
    appReadyPromise = (async () => {
      await ensureDbReady();
      if (isSqlJsActive() && isCloudSyncConfigured()) {
        const cloudBytes = await pullCloudVault();
        lastCloudPullAt = Date.now();
        if (cloudBytes) {
          replaceDatabaseBytes(cloudBytes, false);
        }
      }
      ensureServerlessBootstrap();
    })().catch((err) => {
      appReadyPromise = null;
      throw err;
    });
  }
  await appReadyPromise;
}

async function syncCloudVaultOnWarmLambda(force: boolean): Promise<void> {
  if (!isSqlJsActive() || !isCloudSyncConfigured()) return;
  const now = Date.now();
  if (now - lastCloudPushAt < 1500) return;
  if (!force && now - lastCloudPullAt < 3000) return;
  lastCloudPullAt = now;
  const cloudBytes = await pullCloudVault();
  if (cloudBytes) {
    replaceDatabaseBytes(cloudBytes, true);
  }
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
    const rawHost = (forwardedHost || String(req.get('host') || 'telegram-bot-menager.vercel.app')).replace(
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
    <link rel="icon" href="${origin}/favicon.ico?v=2" sizes="any" />
    <link rel="icon" type="image/png" sizes="192x192" href="${origin}/icon-192.png?v=2" />
    <link rel="apple-touch-icon" sizes="180x180" href="${origin}/apple-touch-icon.png?v=2" />
    <meta property="og:site_name" content="XC BOT CONTROL" />
    <meta property="og:title" content="XC BOT CONTROL — Advanced Developer Console" />
    <meta property="og:description" content="One Dashboard. Complete Bot Control. Advanced Developer Console for managing multiple Telegram bots, webhooks, API explorer, and analytics." />
    <meta property="og:type" content="website" />
    <link rel="image_src" href="${ogImage}" />
    <meta property="og:url" content="${origin}/" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:url" content="${ogImage}" />
    <meta property="og:image:secure_url" content="${ogImage}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="XC BOT CONTROL Logo" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="XC BOT CONTROL — Advanced Developer Console" />
    <meta name="twitter:description" content="One Dashboard. Complete Bot Control. Advanced Developer Console for managing multiple Telegram bots, webhooks, API explorer, and analytics." />
    <meta name="twitter:image" content="${ogImage}" />
    <meta name="twitter:image:alt" content="XC BOT CONTROL Logo" />
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
        const forceCloudSync =
          req.path === '/auth/login' ||
          req.path === '/auth/register' ||
          req.path === '/auth/status' ||
          req.path === '/bots';
        await syncCloudVaultOnWarmLambda(forceCloudSync);

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
        const incomingSeq = parseVaultSeq(incomingRev);

        if (incomingVault) {
          if (!incomingRev || incomingRev !== getVaultRev()) {
            try {
              const rawBytes = decryptVaultBytes(incomingVault);
              replaceDatabaseBytes(rawBytes, true);
            } catch {
              res.setHeader('X-XC-Vault-Reset', '1');
            }
          }
        } else if (
          incomingRev &&
          incomingRev !== getVaultRev() &&
          ((getVaultRev() === 'init' && getVaultSeq() === 0) ||
            incomingSeq > getVaultSeq() ||
            req.path === '/auth/login')
        ) {
          res.status(409).json({
            code: 'VAULT_SYNC_REQUIRED',
            error: 'Synchronizing workspace state...',
          });
          return;
        }

        if (req.path === '/vault/sync' && req.method.toUpperCase() === 'POST') {
          const raw = exportDatabaseBytes();
          if (raw && isCloudSyncConfigured()) {
            lastCloudPushAt = Date.now();
            await Promise.race([pushCloudVault(raw), new Promise((r) => setTimeout(r, 5000))]);
          }
          res.json({ ok: true, rev: getVaultRev() });
          return;
        }

        const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
        const shouldAttachVaultToRead =
          req.method.toUpperCase() === 'GET' &&
          (req.path === '/auth/status' || req.path === '/bots' || req.path === '/dashboard') &&
          getVaultRev() !== 'init' &&
          incomingRev !== getVaultRev();

        if (isMutating || shouldAttachVaultToRead) {
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
              if (isMutating) {
                const nextRev = bumpVaultRev();
                const raw = exportDatabaseBytes();
                if (raw) {
                  const payload = {
                    ...(body as Record<string, unknown>),
                    _vault: encryptVaultBytes(raw),
                    _vaultRev: nextRev,
                  };
                  if (isCloudSyncConfigured()) {
                    lastCloudPushAt = Date.now();
                    void Promise.race([pushCloudVault(raw), new Promise((r) => setTimeout(r, 5000))]).finally(() => {
                      lastCloudPushAt = Date.now();
                      origJson(payload);
                    });
                    return res;
                  }
                  return origJson(payload);
                }
              } else if (
                shouldAttachVaultToRead &&
                (req.path !== '/auth/status' || (body as Record<string, unknown>).authenticated === true)
              ) {
                const raw = exportDatabaseBytes();
                if (raw) {
                  const payload = {
                    ...(body as Record<string, unknown>),
                    _vault: encryptVaultBytes(raw),
                    _vaultRev: getVaultRev(),
                  };
                  return origJson(payload);
                }
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
