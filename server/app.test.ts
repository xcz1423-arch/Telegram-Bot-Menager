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
});
