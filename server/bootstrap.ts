import { db, logActivity } from './db';
import {
  encryptToken,
  generateRandomToken,
  hashPassword,
  hashTokenFingerprint,
  maskToken,
} from './crypto';
import { getSuggestedWebhookBaseUrl, parseEnvBotTokens } from './serverless';
import { seedDemoWorkspace } from './seed';

let bootstrapped = false;

/**
 * Ensures env-configured admin credentials and env-configured bot tokens are
 * initialized into the SQLite store (critical for Vercel serverless cold starts).
 * Idempotent: safe to call repeatedly.
 */
export function ensureServerlessBootstrap(force = false): void {
  if (bootstrapped && !force) return;
  bootstrapped = true;

  const baseUrl = getSuggestedWebhookBaseUrl({
    appUrl: process.env.APP_URL,
    vercelProdUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    vercelUrl: process.env.VERCEL_URL,
  });

  // 1. Env-configured Single Admin user (optional on local, strongly recommended on Vercel)
  const envUsername = (process.env.XC_ADMIN_USERNAME || 'admin').trim();
  const envDisplayName = (process.env.XC_ADMIN_DISPLAY_NAME || 'Lead Developer').trim();
  const envPassword = process.env.XC_ADMIN_PASSWORD || '';

  const adminCount = (db.prepare('SELECT COUNT(*) as cnt FROM admin_users').get() as { cnt: number }).cnt;
  if (adminCount === 0 && envPassword.length >= 8) {
    db.prepare(`
      INSERT INTO admin_users (username, display_name, password_hash, recovery_hint)
      VALUES (?, ?, ?, 'Configured via environment variable')
    `).run(envUsername, envDisplayName || envUsername, hashPassword(envPassword));

    logActivity({
      action: 'ENV_ADMIN_BOOTSTRAP',
      status: 'success',
      relatedResource: envUsername,
      details: 'Initialized administrator account from environment configuration.',
    });
  }

  // 2. Env-configured Bot Tokens (TELEGRAM_BOT_TOKEN / XC_BOT_TOKENS) — encrypted at rest, never exposed to client
  const envBots = parseEnvBotTokens({
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    XC_BOT_TOKENS: process.env.XC_BOT_TOKENS,
  });

  for (let i = 0; i < envBots.length; i++) {
    const entry = envBots[i];
    const fingerprint = hashTokenFingerprint(entry.token);
    const existing = db.prepare('SELECT id FROM bots WHERE token_fingerprint = ?').get(fingerprint);
    if (existing) continue;

    const isSandbox = entry.token.startsWith('sandbox:');
    const parsedId = isSandbox
      ? 7200000000 + i
      : Number(entry.token.split(':')[0]) || 7200000000 + i;
    const rawUsername = isSandbox
      ? entry.token.slice('sandbox:'.length).replace(/[^a-zA-Z0-9_]/g, '_') || `env_bot_${i + 1}`
      : `bot_${parsedId}`;
    const botKey = `${rawUsername.toLowerCase().slice(0, 24)}_${generateRandomToken(4)}`;
    const encryptedToken = encryptToken(entry.token);
    const webhookSecret = entry.webhookSecret ? encryptToken(entry.webhookSecret) : null;

    const ins = db
      .prepare(`
        INSERT INTO bots (
          bot_key, telegram_bot_id, name, username, short_description, description,
          mode, encrypted_token, token_fingerprint, token_masked,
          connection_status, webhook_status, webhook_secret_encrypted,
          last_checked_at, last_activity_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected', 'inactive', ?, datetime('now'), datetime('now'))
      `)
      .run(
        botKey,
        parsedId,
        entry.name || (isSandbox ? `Sandbox ${rawUsername}` : `Telegram Bot ${parsedId}`),
        rawUsername,
        'Loaded securely from server environment configuration.',
        'Bot token provisioned via server environment variable. Use Revalidate to sync live profile metadata.',
        isSandbox ? 'sandbox' : 'live',
        encryptedToken,
        fingerprint,
        maskToken(entry.token),
        webhookSecret
      );

    db.prepare('INSERT OR IGNORE INTO bot_settings (bot_id) VALUES (?)').run(Number(ins.lastInsertRowid));
  }

  // 3. Optional demo workspace seeding (XC_SEED_DEMO=true)
  if (process.env.XC_SEED_DEMO === 'true') {
    seedDemoWorkspace(baseUrl);
  }
}
