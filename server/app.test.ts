import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

// Use an isolated temporary storage directory so tests never touch production storage/
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xc-bot-test-'));
process.env.XC_STORAGE_DIR = tmpDir;
process.env.XC_FORCE_SQLJS = '1';
process.env.XC_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const SAMPLE_AVATAR =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

test('admin-only backup routes, cross-device login bots & avatar, and stale vault protection', async (t) => {
  const { createApp, ensureAppReady } = await import('./app.js');
  await ensureAppReady();

  const app = createApp();
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  t.after(() => {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // 1. Device A creates primary Admin account with profile picture
  const regAdmin = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'lead_admin',
      displayName: 'Lead Admin',
      password: 'AdminPassword!123',
      avatarDataUrl: SAMPLE_AVATAR,
    }),
  });
  assert.equal(regAdmin.status, 201);
  const adminCookie = regAdmin.headers.get('set-cookie')?.split(';')[0] || '';
  const adminBody = (await regAdmin.json()) as {
    csrfToken: string;
    sessionToken: string;
    admin: { role: string; avatarUrl: string | null };
    _vault?: string;
    _vaultRev?: string;
  };
  assert.equal(adminBody.admin.role, 'admin');
  assert.equal(adminBody.admin.avatarUrl, SAMPLE_AVATAR);
  const staleVaultBeforeBot = adminBody._vault || '';
  const staleRevBeforeBot = adminBody._vaultRev || '';

  // 2. Device A connects a bot
  const addBot = await fetch(`${baseUrl}/api/bots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
      'X-CSRF-Token': adminBody.csrfToken,
    },
    body: JSON.stringify({
      token: 'sandbox:cross_device_bot',
      name: 'Cross Device Relay',
    }),
  });
  assert.equal(addBot.status, 201);

  // 3. Register a standard (non-admin) user
  const regUser = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'normal_user',
      displayName: 'Normal User',
      password: 'UserPassword!123',
      avatarDataUrl: SAMPLE_AVATAR,
    }),
  });
  assert.equal(regUser.status, 201);
  const userCookie = regUser.headers.get('set-cookie')?.split(';')[0] || '';
  const userBody = (await regUser.json()) as {
    csrfToken: string;
    admin: { role: string };
  };
  assert.equal(userBody.admin.role, 'user');

  // 4. Standard user is blocked (403) from Backup & Restore endpoints; Admin succeeds (200)
  const userExport = await fetch(`${baseUrl}/api/backup/export`, {
    headers: { Cookie: userCookie },
  });
  assert.equal(userExport.status, 403);

  const userSchema = await fetch(`${baseUrl}/api/backup/sql-schema`, {
    headers: { Cookie: userCookie },
  });
  assert.equal(userSchema.status, 403);

  const userRestore = await fetch(`${baseUrl}/api/backup/restore`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: userCookie,
      'X-CSRF-Token': userBody.csrfToken,
    },
    body: JSON.stringify({ checksum: 'bad', data: {} }),
  });
  assert.equal(userRestore.status, 403);

  const adminExport = await fetch(`${baseUrl}/api/backup/export`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(adminExport.status, 200);

  // 5. Device B (fresh client: no cookies, no localStorage vault) signs into lead_admin
  const deviceBLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'lead_admin',
      password: 'AdminPassword!123',
      rememberMe: true,
    }),
  });
  assert.equal(deviceBLogin.status, 200);
  const deviceBCookie = deviceBLogin.headers.get('set-cookie')?.split(';')[0] || '';
  const deviceBBody = (await deviceBLogin.json()) as {
    sessionToken: string;
    admin: { avatarUrl: string | null };
    _vault?: string;
    _vaultRev?: string;
  };
  assert.equal(deviceBBody.admin.avatarUrl, SAMPLE_AVATAR);
  assert.ok(deviceBBody._vault);
  assert.ok(deviceBBody._vaultRev);

  // Device B fetches connected bots via cookie
  const deviceBBots = await fetch(`${baseUrl}/api/bots`, {
    headers: { Cookie: deviceBCookie },
  });
  assert.equal(deviceBBots.status, 200);
  const deviceBBotsJson = (await deviceBBots.json()) as { bots: Array<{ name: string; username: string }> };
  assert.equal(deviceBBotsJson.bots.length, 1);
  assert.equal(deviceBBotsJson.bots[0].name, 'Cross Device Relay');

  // Device B fetches status & bots using Bearer fallback (no cookies, simulating restricted webview/iframe)
  const bearerStatus = await fetch(`${baseUrl}/api/auth/status`, {
    headers: { Authorization: `Bearer ${deviceBBody.sessionToken}` },
  });
  assert.equal(bearerStatus.status, 200);
  const bearerStatusJson = (await bearerStatus.json()) as {
    authenticated: boolean;
    admin: { avatarUrl: string | null };
  };
  assert.equal(bearerStatusJson.authenticated, true);
  assert.equal(bearerStatusJson.admin.avatarUrl, SAMPLE_AVATAR);

  const bearerBots = await fetch(`${baseUrl}/api/bots`, {
    headers: { Authorization: `Bearer ${deviceBBody.sessionToken}` },
  });
  assert.equal(bearerBots.status, 200);
  const bearerBotsJson = (await bearerBots.json()) as { bots: Array<{ name: string }> };
  assert.equal(bearerBotsJson.bots.length, 1);

  // 6. Stale client vault from before the bot was added must NOT overwrite newer server bots
  if (staleVaultBeforeBot) {
    const staleRes = await fetch(`${baseUrl}/api/bots`, {
      headers: {
        Cookie: deviceBCookie,
        'X-XC-Vault': staleVaultBeforeBot,
        'X-XC-Vault-Rev': staleRevBeforeBot,
      },
    });
    assert.equal(staleRes.status, 200);
    const staleJson = (await staleRes.json()) as { bots: Array<{ name: string }> };
    assert.equal(staleJson.bots.length, 1);
  }

  // 7. Social preview HTML serves exact forwarded host & og-preview.jpg + favicons
  const ogRes = await fetch(`${baseUrl}/api/og-html`, {
    headers: {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'telegram-bot-menager.vercel.app',
    },
  });
  assert.equal(ogRes.status, 200);
  const ogHtml = await ogRes.text();
  assert.match(ogHtml, /https:\/\/telegram-bot-menager\.vercel\.app\/og-preview\.jpg/);
  assert.match(ogHtml, /https:\/\/telegram-bot-menager\.vercel\.app\/favicon\.ico/);
  assert.match(ogHtml, /https:\/\/telegram-bot-menager\.vercel\.app\/icon-192\.png/);

  // 8. Static favicons & og-preview exist in public/ and index.html references telegram-bot-menager.vercel.app
  const publicDir = path.resolve(process.cwd(), 'public');
  for (const asset of ['favicon.ico', 'favicon-32x32.png', 'favicon-48x48.png', 'icon-192.png', 'apple-touch-icon.png', 'site.webmanifest', 'og-preview.jpg']) {
    assert.ok(fs.existsSync(path.join(publicDir, asset)), `Missing public/${asset}`);
  }
  const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
  assert.match(indexHtml, /https:\/\/telegram-bot-menager\.vercel\.app\/og-preview\.jpg/);
  assert.doesNotMatch(indexHtml, /telegram-bot-manager\.vercel\.app/);

  // 9. Lower-sequence vault containing a newly registered user merges into higher-sequence server & logs in cleanly
  const { encryptVaultBytes } = await import('./crypto.js');
  const initSqlJs = (await import('sql.js/dist/sql-wasm-inline.js')).default as unknown as () => Promise<{
    Database: new () => { exec: (s: string) => void; run: (s: string, p?: unknown[]) => void; export: () => Uint8Array };
  }>;
  const SQL = await initSqlJs();
  const coldDb = new SQL.Database();
  coldDb.exec(`
    CREATE TABLE admin_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', avatar_url TEXT, badge TEXT NOT NULL DEFAULT 'none', is_blocked INTEGER NOT NULL DEFAULT 0, created_ip TEXT, session_version INTEGER NOT NULL DEFAULT 1, recovery_hint TEXT, last_login_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE bots (id INTEGER PRIMARY KEY AUTOINCREMENT, bot_key TEXT NOT NULL UNIQUE, telegram_bot_id INTEGER NOT NULL, name TEXT NOT NULL, username TEXT NOT NULL, short_description TEXT DEFAULT '', description TEXT DEFAULT '', mode TEXT NOT NULL DEFAULT 'live', encrypted_token TEXT NOT NULL, token_fingerprint TEXT NOT NULL UNIQUE, token_masked TEXT NOT NULL, connection_status TEXT NOT NULL DEFAULT 'connected', webhook_status TEXT NOT NULL DEFAULT 'inactive', webhook_url TEXT, webhook_secret_encrypted TEXT, pending_update_count INTEGER NOT NULL DEFAULT 0, last_webhook_error TEXT, can_join_groups INTEGER NOT NULL DEFAULT 1, can_read_all_group_messages INTEGER NOT NULL DEFAULT 0, supports_inline_queries INTEGER NOT NULL DEFAULT 0, last_checked_at TEXT, last_activity_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE app_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  `);
  const { hashPassword } = await import('./crypto.js');
  coldDb.run(
    `INSERT INTO admin_users (username, display_name, password_hash, role, avatar_url) VALUES (?, ?, ?, 'admin', ?)`,
    ['MIRAZ', 'Miraz', hashPassword('098@098@'), SAMPLE_AVATAR]
  );
  coldDb.run(`INSERT INTO app_settings (setting_key, setting_value) VALUES ('__vault_seq', '1')`);
  coldDb.run(`INSERT INTO app_settings (setting_key, setting_value) VALUES ('__vault_rev', '1:coldrev')`);
  const coldVault = encryptVaultBytes(coldDb.export());

  const mirazLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-XC-Vault-Rev': '1:coldrev' },
    body: JSON.stringify({ username: 'MIRAZ', password: '098@098@', rememberMe: true, _vault: coldVault }),
  });
  assert.equal(mirazLogin.status, 200);
  const mirazJson = (await mirazLogin.json()) as { admin: { username: string; role: string } };
  assert.equal(mirazJson.admin.username, 'MIRAZ');
  assert.equal(mirazJson.admin.role, 'user');

  // 10. Deleting a bot creates a tombstone so a stale vault snapshot can NEVER bring it back on refresh
  const addTempBot = await fetch(`${baseUrl}/api/bots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
      'X-CSRF-Token': adminBody.csrfToken,
    },
    body: JSON.stringify({ token: 'sandbox:temp_delete_verify', name: 'Temp Delete Bot' }),
  });
  assert.equal(addTempBot.status, 201);
  const tempBotJson = (await addTempBot.json()) as {
    bot: { id: number };
    _vault?: string;
    _vaultRev?: string;
  };
  const staleVaultWithDeletedBot = tempBotJson._vault || '';
  const staleRevWithDeletedBot = tempBotJson._vaultRev || '';

  const delBotRes = await fetch(`${baseUrl}/api/bots/${tempBotJson.bot.id}`, {
    method: 'DELETE',
    headers: {
      Cookie: adminCookie,
      'X-CSRF-Token': adminBody.csrfToken,
    },
  });
  assert.equal(delBotRes.status, 200);

  // Even if a stale browser tab or warm Lambda sends the old vault snapshot containing Temp Delete Bot,
  // GET /api/bots must NOT resurrect the deleted bot.
  const refreshAfterDelete = await fetch(`${baseUrl}/api/bots`, {
    headers: {
      Cookie: adminCookie,
      ...(staleVaultWithDeletedBot ? { 'X-XC-Vault': staleVaultWithDeletedBot } : {}),
      ...(staleRevWithDeletedBot ? { 'X-XC-Vault-Rev': staleRevWithDeletedBot } : {}),
    },
  });
  assert.equal(refreshAfterDelete.status, 200);
  const refreshBotsJson = (await refreshAfterDelete.json()) as { bots: Array<{ username: string }> };
  assert.equal(
    refreshBotsJson.bots.some((b) => b.username === 'temp_delete_verify'),
    false
  );
});

