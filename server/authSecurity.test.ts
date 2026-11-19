import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xc-auth-test-'));
process.env.XC_STORAGE_DIR = tmpDir;
process.env.XC_MASTER_KEY = 'test-master-key-for-auth-security-integration';

const SAMPLE_AVATAR =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function extractCookie(setCookieHeader: string | null): string {
  assert.ok(setCookieHeader, 'Expected Set-Cookie header');
  const firstPart = setCookieHeader.split(';')[0];
  assert.ok(firstPart.startsWith('xc_session='), `Unexpected cookie: ${firstPart}`);
  return firstPart;
}

test('unique name/username, login alerts, login/logout history, and remote session logout', async (t) => {
  const { createApp } = await import('./app.js');
  const app = createApp();
  const server = app.listen(0);
  t.after(() => {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // 1. Register User 1 (xc / xzc)
  const reg1 = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/126.0.0.0' },
    body: JSON.stringify({
      displayName: 'xc',
      username: 'xzc',
      password: 'Password123!',
      avatarDataUrl: SAMPLE_AVATAR,
    }),
  });
  assert.equal(reg1.status, 201);
  const reg1Json = (await reg1.json()) as { csrfToken: string; admin: { id: number; role: string } };
  const cookie1 = extractCookie(reg1.headers.get('set-cookie'));
  assert.equal(reg1Json.admin.role, 'admin');

  // 2. Duplicate Display Name (case-insensitive) with different username -> 409
  const dupName = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: 'XC ',
      username: 'other_user',
      password: 'Password123!',
      avatarDataUrl: SAMPLE_AVATAR,
    }),
  });
  assert.equal(dupName.status, 409);
  const dupNameJson = (await dupName.json()) as { code: string; conflict: string };
  assert.equal(dupNameJson.code, 'NAME_OR_USERNAME_TAKEN');
  assert.equal(dupNameJson.conflict, 'name');

  // 3. Duplicate Username (case-insensitive) with different name -> 409
  const dupUser = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Another User',
      username: 'XZC',
      password: 'Password123!',
      avatarDataUrl: SAMPLE_AVATAR,
    }),
  });
  assert.equal(dupUser.status, 409);
  const dupUserJson = (await dupUser.json()) as { code: string; conflict: string };
  assert.equal(dupUserJson.code, 'NAME_OR_USERNAME_TAKEN');
  assert.equal(dupUserJson.conflict, 'username');

  // 4. Register User 2 cleanly
  const reg2 = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: 'xcb',
      username: 'xzd',
      password: 'Password123!',
      avatarDataUrl: SAMPLE_AVATAR,
    }),
  });
  assert.equal(reg2.status, 201);
  const reg2Json = (await reg2.json()) as { csrfToken: string };
  const cookie2 = extractCookie(reg2.headers.get('set-cookie'));

  // 5. User 2 cannot rename profile to match User 1's Display Name -> 409
  const renameConflict = await fetch(`${baseUrl}/api/auth/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie2,
      'X-CSRF-Token': reg2Json.csrfToken,
    },
    body: JSON.stringify({ displayName: 'xc' }),
  });
  assert.equal(renameConflict.status, 409);

  // 6. Second login into User 1 (from Mobile device) triggers private login_alert notification
  const loginB = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/126.0.0.0 Mobile',
      'X-Forwarded-For': '203.0.113.42',
    },
    body: JSON.stringify({ username: 'xzc', password: 'Password123!', rememberMe: true }),
  });
  assert.equal(loginB.status, 200);
  const loginBJson = (await loginB.json()) as { csrfToken: string };
  const cookie1B = extractCookie(loginB.headers.get('set-cookie'));

  const notifs1 = await fetch(`${baseUrl}/api/notifications`, {
    headers: { Cookie: cookie1 },
  });
  assert.equal(notifs1.status, 200);
  const notifs1Json = (await notifs1.json()) as {
    notifications: Array<{ kind: string; title: string; message: string; sender_ip: string }>;
  };
  const loginAlert = notifs1Json.notifications.find((n) => n.kind === 'login_alert');
  assert.ok(loginAlert, 'User 1 should receive a login_alert notification');
  assert.match(loginAlert.message, /203\.0\.113\.42/);
  assert.match(loginAlert.message, /Chrome · Android/);

  // User 2 must NOT see User 1's login alert
  const notifs2 = await fetch(`${baseUrl}/api/notifications`, {
    headers: { Cookie: cookie2 },
  });
  const notifs2Json = (await notifs2.json()) as {
    notifications: Array<{ kind: string }>;
  };
  assert.equal(
    notifs2Json.notifications.some((n) => n.kind === 'login_alert'),
    false,
    'User 2 must not see User 1 login alerts'
  );

  // 7. User 1 views sessions & remotely revokes Session B
  const sessionsRes = await fetch(`${baseUrl}/api/auth/sessions`, {
    headers: { Cookie: cookie1 },
  });
  assert.equal(sessionsRes.status, 200);
  const sessionsJson = (await sessionsRes.json()) as {
    currentSessionId: number;
    sessions: Array<{ id: number; ip_address: string }>;
    loginHistory: Array<{ event_type: string; reason: string }>;
  };
  const otherSession = sessionsJson.sessions.find((s) => s.id !== sessionsJson.currentSessionId);
  assert.ok(otherSession, 'Should list the second active session for User 1');

  const revokeRes = await fetch(`${baseUrl}/api/auth/sessions/${otherSession.id}`, {
    method: 'DELETE',
    headers: {
      Cookie: cookie1,
      'X-CSRF-Token': reg1Json.csrfToken,
    },
  });
  assert.equal(revokeRes.status, 200);

  // Revoked session B cookie MUST fail with 401 (no stateless fallback bypass!)
  const revokedCall = await fetch(`${baseUrl}/api/bots`, {
    headers: { Cookie: cookie1B },
  });
  assert.equal(revokedCall.status, 401);

  // 8. Login a 3rd session C, revoke-others via POST, verify session C fails with 401 and session A gets updated cookie & works
  const loginC = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (iPhone) Safari/604.1' },
    body: JSON.stringify({ username: 'xzc', password: 'Password123!', rememberMe: false }),
  });
  assert.equal(loginC.status, 200);
  const cookie1C = extractCookie(loginC.headers.get('set-cookie'));

  const revokeAllRes = await fetch(`${baseUrl}/api/auth/sessions/revoke-others`, {
    method: 'POST',
    headers: {
      Cookie: cookie1,
      'X-CSRF-Token': reg1Json.csrfToken,
    },
  });
  assert.equal(revokeAllRes.status, 200);
  const revokeAllJson = (await revokeAllRes.json()) as { csrfToken: string };
  const freshCookie1 = extractCookie(revokeAllRes.headers.get('set-cookie'));

  const revokedCCall = await fetch(`${baseUrl}/api/bots`, {
    headers: { Cookie: cookie1C },
  });
  assert.equal(revokedCCall.status, 401);

  // 9. Logout freshCookie1 and verify 'logout' & 'session_revoked' appear in loginHistory & freshCookie1 is rejected
  const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: {
      Cookie: freshCookie1,
      'X-CSRF-Token': revokeAllJson.csrfToken,
    },
  });
  assert.equal(logoutRes.status, 200);

  const afterLogoutCall = await fetch(`${baseUrl}/api/bots`, {
    headers: { Cookie: freshCookie1 },
  });
  assert.equal(afterLogoutCall.status, 401);

  // Login once more to inspect full loginHistory
  const loginD = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'xzc', password: 'Password123!' }),
  });
  const cookie1D = extractCookie(loginD.headers.get('set-cookie'));
  const historyRes = await fetch(`${baseUrl}/api/auth/sessions`, {
    headers: { Cookie: cookie1D },
  });
  const historyJson = (await historyRes.json()) as {
    loginHistory: Array<{ event_type: string }>;
  };
  const eventTypes = new Set(historyJson.loginHistory.map((h) => h.event_type));
  assert.equal(eventTypes.has('login'), true);
  assert.equal(eventTypes.has('logout'), true);
  assert.equal(eventTypes.has('session_revoked'), true);
  // Suppress unused variable lint
  void loginBJson;
});
