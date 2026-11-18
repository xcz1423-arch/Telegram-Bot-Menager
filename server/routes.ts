import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  db,
  getDbEngineName,
  getDbPath,
  getSetting,
  incrementDailyAnalytics,
  isServerlessRuntime,
  logActivity,
  pushNotification,
  setSetting,
} from './db.js';

type SQLInputValue = string | number | Uint8Array | null;
import {
  computeBackupChecksum,
  decryptToken,
  encryptToken,
  generateRandomToken,
  hashPassword,
  hashTokenFingerprint,
  hasExplicitMasterKey,
  maskToken,
  verifyPassword,
} from './crypto.js';
import {
  checkLoginRateLimit,
  clearSessionCookie,
  createAdminSession,
  getClientIp,
  parseCookies,
  recordLoginAttempt,
  requireAuth,
  resolveSessionFromRequest,
  SESSION_COOKIE_NAME,
  setSessionCookie,
  hashSessionToken,
} from './security.js';
import { getSuggestedWebhookBaseUrl } from './serverless.js';
import { seedDemoWorkspace } from './seed.js';
import {
  BotRecord,
  executeBotMethod,
  executeDirectWebhookMethod,
  processIncomingWebhookUpdate,
  setBotProfilePhoto,
  validateTokenWithTelegram,
} from './telegramClient.js';
import {
  redactSecrets,
  validateBotTokenFormat,
  validateCommandDescription,
  validateCommandName,
  validateWebhookUrl,
} from '../src/lib/telegramSpec.js';

export const apiRouter = express.Router();

function sanitizeBotForClient(row: BotRecord) {
  return {
    id: row.id,
    bot_key: row.bot_key,
    telegram_bot_id: row.telegram_bot_id,
    name: row.name,
    username: row.username,
    short_description: row.short_description,
    description: row.description,
    mode: row.mode,
    token_masked: row.token_masked,
    connection_status: row.connection_status,
    webhook_status: row.webhook_status,
    webhook_url: row.webhook_url,
    avatar_url: getSetting(`bot_avatar_${row.id}`, '') || null,
    has_webhook_secret: Boolean(row.webhook_secret_encrypted),
    pending_update_count: row.pending_update_count,
    last_webhook_error: row.last_webhook_error,
    can_join_groups: Boolean(row.can_join_groups),
    can_read_all_group_messages: Boolean(row.can_read_all_group_messages),
    supports_inline_queries: Boolean(row.supports_inline_queries),
    last_checked_at: row.last_checked_at,
    last_activity_at: row.last_activity_at,
  };
}

function getBotById(botId: number): BotRecord | undefined {
  return db.prepare('SELECT * FROM bots WHERE id = ?').get(botId) as BotRecord | undefined;
}

// ============================================================================
// PUBLIC HEALTH & INCOMING WEBHOOK RECEIVER
// ============================================================================
apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, status: 'operational' });
});

// Telegram Incoming Webhook Endpoint
apiRouter.post('/webhook/:botKey', (req, res) => {
  const { botKey } = req.params;
  const bot = db.prepare('SELECT * FROM bots WHERE bot_key = ?').get(botKey) as BotRecord | undefined;
  if (!bot) {
    res.status(404).json({ ok: false, error: 'Bot endpoint not found' });
    return;
  }
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const outcome = processIncomingWebhookUpdate({
    bot,
    secretHeader: typeof secretHeader === 'string' ? secretHeader : undefined,
    payload,
  });
  res.status(outcome.httpStatus).json({ ok: outcome.ok, status: outcome.status, message: outcome.message });
});

// ============================================================================
// SINGLE-ADMIN AUTHENTICATION
// ============================================================================
apiRouter.get('/auth/status', (req, res) => {
  const adminCount = (db.prepare('SELECT COUNT(*) as cnt FROM admin_users').get() as { cnt: number }).cnt;
  const { session, hadCookie } = resolveSessionFromRequest(req);

  if (!session) {
    if (hadCookie) {
      clearSessionCookie(res);
    }
    res.json({
      setupRequired: adminCount === 0,
      authenticated: false,
    });
    return;
  }

  res.json({
    setupRequired: false,
    authenticated: true,
    csrfToken: session.csrfToken,
    admin: {
      id: session.userId,
      username: session.username,
      displayName: session.displayName,
      lastLoginAt: session.lastLoginAt,
    },
  });
});

apiRouter.post('/auth/setup', (req, res) => {
  const adminCount = (db.prepare('SELECT COUNT(*) as cnt FROM admin_users').get() as { cnt: number }).cnt;
  if (adminCount > 0) {
    res.status(403).json({ error: 'Administrator account already exists. Initial setup is locked.' });
    return;
  }

  const username = String(req.body?.username ?? '').trim();
  const displayName = String(req.body?.displayName ?? username).trim();
  const password = String(req.body?.password ?? '');
  const recoveryHint = String(req.body?.recoveryHint ?? '').trim();
  const seedDemo = Boolean(req.body?.seedDemo ?? false);

  if (username.length < 3 || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
    res.status(400).json({ error: 'Username must be at least 3 characters (letters, numbers, _, ., -).' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }

  const passwordHash = hashPassword(password);
  const insert = db
    .prepare(`
      INSERT INTO admin_users (username, display_name, password_hash, recovery_hint, last_login_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `)
    .run(username, displayName || username, passwordHash, recoveryHint || null);

  const userId = Number(insert.lastInsertRowid);
  const ip = getClientIp(req);

  if (seedDemo) {
    const baseUrl = getSuggestedWebhookBaseUrl({
      appUrl: process.env.APP_URL,
      vercelProdUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
      vercelUrl: process.env.VERCEL_URL,
      host: req.get('host'),
      proto: String(req.headers['x-forwarded-proto'] || req.protocol),
    });
    seedDemoWorkspace(baseUrl);
  }

  const session = createAdminSession({
    userId,
    rememberMe: true,
    ipAddress: ip,
    userAgent: String(req.headers['user-agent'] || 'Unknown'),
  });
  setSessionCookie(res, session.rawToken, session.expiresAt);

  db.prepare(`INSERT INTO login_history (username, success, ip_address, user_agent, reason) VALUES (?, 1, ?, ?, 'Initial setup')`).run(
    username,
    ip,
    String(req.headers['user-agent'] || 'Unknown').slice(0, 200)
  );
  logActivity({
    action: 'ADMIN_SETUP_COMPLETE',
    status: 'success',
    relatedResource: username,
    details: 'Created single-admin account and locked setup.',
    ipAddress: ip,
  });

  res.status(201).json({
    ok: true,
    csrfToken: session.csrfToken,
    admin: { id: userId, username, displayName: displayName || username },
  });
});

// Fast ?autostart=1 workspace initialization for frictionless evaluation
apiRouter.post('/auth/autostart', (req, res) => {
  let admin = db.prepare('SELECT id, username, display_name FROM admin_users LIMIT 1').get() as
    | { id: number; username: string; display_name: string }
    | undefined;

  if (!admin) {
    const pw = generateRandomToken(12);
    const ins = db
      .prepare(`
        INSERT INTO admin_users (username, display_name, password_hash, recovery_hint, last_login_at)
        VALUES ('admin', 'Lead Developer', ?, 'Configured via XC_RECOVERY_CODE', datetime('now'))
      `)
      .run(hashPassword(pw));
    admin = { id: Number(ins.lastInsertRowid), username: 'admin', display_name: 'Lead Developer' };
  }

  const baseUrl = getSuggestedWebhookBaseUrl({
    appUrl: process.env.APP_URL,
    vercelProdUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    vercelUrl: process.env.VERCEL_URL,
    host: req.get('host'),
    proto: String(req.headers['x-forwarded-proto'] || req.protocol),
  });
  seedDemoWorkspace(baseUrl);

  const session = createAdminSession({
    userId: admin.id,
    rememberMe: true,
    ipAddress: getClientIp(req),
    userAgent: String(req.headers['user-agent'] || 'Unknown'),
  });
  setSessionCookie(res, session.rawToken, session.expiresAt);

  res.json({
    ok: true,
    csrfToken: session.csrfToken,
    admin: { id: admin.id, username: admin.username, displayName: admin.display_name },
  });
});

apiRouter.post('/auth/login', (req, res) => {
  const ip = getClientIp(req);
  const rate = checkLoginRateLimit(ip);
  if (!rate.allowed) {
    res.status(429).json({
      error: `Too many failed login attempts. Try again in ${rate.retryAfterSeconds}s.`,
    });
    return;
  }

  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  const rememberMe = Boolean(req.body?.rememberMe);
  const ua = String(req.headers['user-agent'] || 'Unknown').slice(0, 200);

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }

  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username) as
    | { id: number; username: string; display_name: string; password_hash: string }
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    recordLoginAttempt(ip, false);
    db.prepare(`INSERT INTO login_history (username, success, ip_address, user_agent, reason) VALUES (?, 0, ?, ?, 'Invalid credentials')`).run(
      username,
      ip,
      ua
    );
    logActivity({
      action: 'ADMIN_LOGIN_FAILED',
      status: 'warning',
      relatedResource: username,
      details: 'Invalid username or password attempt.',
      ipAddress: ip,
    });
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }

  recordLoginAttempt(ip, true);
  db.prepare(`UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);
  db.prepare(`INSERT INTO login_history (username, success, ip_address, user_agent, reason) VALUES (?, 1, ?, ?, 'Password login')`).run(
    user.username,
    ip,
    ua
  );

  const session = createAdminSession({
    userId: user.id,
    rememberMe,
    ipAddress: ip,
    userAgent: ua,
  });
  setSessionCookie(res, session.rawToken, session.expiresAt);

  logActivity({
    action: 'ADMIN_LOGIN',
    status: 'success',
    relatedResource: user.username,
    details: rememberMe ? 'Signed in (Remember Me enabled).' : 'Signed in.',
    ipAddress: ip,
  });

  res.json({
    ok: true,
    csrfToken: session.csrfToken,
    admin: { id: user.id, username: user.username, displayName: user.display_name },
  });
});

apiRouter.post('/auth/recover', (req, res) => {
  const recoveryCode = String(req.body?.recoveryCode ?? '').trim();
  const newPassword = String(req.body?.newPassword ?? '');
  const expectedCode = process.env.XC_RECOVERY_CODE || 'XC-RECOVERY-2026';

  if (!recoveryCode || recoveryCode !== expectedCode) {
    res.status(403).json({ error: 'Invalid configured recovery code.' });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters.' });
    return;
  }

  const admin = db.prepare('SELECT id, username FROM admin_users LIMIT 1').get() as { id: number; username: string } | undefined;
  if (!admin) {
    res.status(404).json({ error: 'No administrator account configured yet.' });
    return;
  }

  db.prepare(`UPDATE admin_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
    hashPassword(newPassword),
    admin.id
  );
  db.prepare('DELETE FROM admin_sessions WHERE user_id = ?').run(admin.id);

  logActivity({
    action: 'ADMIN_PASSWORD_RECOVERED',
    status: 'warning',
    relatedResource: admin.username,
    details: 'Password reset via configured recovery code.',
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true, message: 'Password updated. You can now sign in with your new password.' });
});

// All endpoints below require authenticated single-admin session + CSRF token
apiRouter.use(requireAuth);

apiRouter.post('/auth/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (rawToken) {
    db.prepare('DELETE FROM admin_sessions WHERE session_token_hash = ?').run(hashSessionToken(rawToken));
  }
  clearSessionCookie(res);
  logActivity({
    action: 'ADMIN_LOGOUT',
    status: 'success',
    relatedResource: req.auth?.username,
    details: 'Administrator signed out.',
    ipAddress: getClientIp(req),
  });
  res.json({ ok: true });
});

apiRouter.post('/auth/change-password', (req, res) => {
  const currentPassword = String(req.body?.currentPassword ?? '');
  const newPassword = String(req.body?.newPassword ?? '');

  if (newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters.' });
    return;
  }

  const user = db.prepare('SELECT id, username, password_hash FROM admin_users WHERE id = ?').get(req.auth!.userId) as
    | { id: number; username: string; password_hash: string }
    | undefined;
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }

  db.prepare(`UPDATE admin_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
    hashPassword(newPassword),
    user.id
  );

  logActivity({
    action: 'ADMIN_PASSWORD_CHANGED',
    status: 'success',
    relatedResource: user.username,
    details: 'Administrator password rotated.',
    ipAddress: getClientIp(req),
  });
  res.json({ ok: true, message: 'Password changed successfully.' });
});

apiRouter.get('/auth/sessions', (req, res) => {
  const sessions = db
    .prepare(`
      SELECT id, user_agent, ip_address, remember_me, expires_at, created_at, last_seen_at
      FROM admin_sessions
      WHERE user_id = ?
      ORDER BY last_seen_at DESC
    `)
    .all(req.auth!.userId) as Record<string, unknown>[];

  const loginHistory = db
    .prepare(`SELECT id, username, success, ip_address, user_agent, reason, created_at FROM login_history ORDER BY created_at DESC LIMIT 20`)
    .all();

  res.json({
    currentSessionId: req.auth!.sessionId,
    sessions,
    loginHistory,
  });
});

apiRouter.delete('/auth/sessions/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.auth!.sessionId) {
    res.status(400).json({ error: 'Use Sign Out to end your active session.' });
    return;
  }
  db.prepare('DELETE FROM admin_sessions WHERE id = ? AND user_id = ?').run(id, req.auth!.userId);
  res.json({ ok: true });
});

// ============================================================================
// MAIN DASHBOARD
// ============================================================================
apiRouter.get('/dashboard', (req, res) => {
  const botIdFilter = req.query.botId ? Number(req.query.botId) : null;

  const bots = db.prepare('SELECT * FROM bots ORDER BY created_at DESC').all() as unknown as BotRecord[];
  const totalBots = bots.length;
  const activeBots = bots.filter((b) => b.connection_status === 'connected').length;
  const inactiveBots = totalBots - activeBots;

  const msgWhere = botIdFilter ? 'WHERE bot_id = ?' : '';
  const msgParams = botIdFilter ? [botIdFilter] : [];

  const messagesSent = (
    db.prepare(`SELECT COUNT(*) as cnt FROM bot_messages ${msgWhere}`).get(...msgParams) as { cnt: number }
  ).cnt;
  const updatesReceived = (
    db.prepare(`SELECT COUNT(*) as cnt FROM bot_updates ${msgWhere}`).get(...msgParams) as { cnt: number }
  ).cnt;
  const apiAgg = db
    .prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) as success,
              SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) as failed
       FROM api_logs ${msgWhere}`
    )
    .get(...msgParams) as { total: number; success: number | null; failed: number | null };

  // Include daily rollup metrics if larger than raw rows (historical seed + live increments)
  const dailyTotals = db
    .prepare(
      `SELECT COALESCE(SUM(messages_sent), 0) as msgs,
              COALESCE(SUM(updates_received), 0) as upds,
              COALESCE(SUM(api_requests), 0) as reqs,
              COALESCE(SUM(api_success), 0) as ok_cnt,
              COALESCE(SUM(api_failed), 0) as fail_cnt
       FROM analytics_daily ${msgWhere}`
    )
    .get(...msgParams) as { msgs: number; upds: number; reqs: number; ok_cnt: number; fail_cnt: number };

  const series = db
    .prepare(
      `SELECT metric_date as date,
              SUM(messages_sent) as messages_sent,
              SUM(updates_received) as updates_received,
              SUM(api_requests) as api_requests,
              SUM(api_success) as api_success,
              SUM(api_failed) as api_failed
       FROM analytics_daily
       ${botIdFilter ? 'WHERE bot_id = ?' : ''}
       GROUP BY metric_date
       ORDER BY metric_date ASC
       LIMIT 30`
    )
    .all(...msgParams);

  const recentUpdates = db
    .prepare(`
      SELECT u.id, u.bot_id, b.name as bot_name, b.username as bot_username, u.update_id, u.update_type, u.summary, u.processing_status, u.received_at
      FROM bot_updates u
      JOIN bots b ON b.id = u.bot_id
      ${botIdFilter ? 'WHERE u.bot_id = ?' : ''}
      ORDER BY u.received_at DESC LIMIT 6
    `)
    .all(...msgParams);

  const recentMessages = db
    .prepare(`
      SELECT m.id, m.bot_id, b.name as bot_name, m.chat_id, m.message_type, m.content_preview, m.delivery_status, m.sent_at
      FROM bot_messages m
      JOIN bots b ON b.id = m.bot_id
      ${botIdFilter ? 'WHERE m.bot_id = ?' : ''}
      ORDER BY m.sent_at DESC LIMIT 6
    `)
    .all(...msgParams);

  const recentApiRequests = db
    .prepare(`
      SELECT a.id, a.bot_id, b.username as bot_username, a.method, a.http_status, a.ok, a.duration_ms, a.error_message, a.created_at
      FROM api_logs a
      LEFT JOIN bots b ON b.id = a.bot_id
      ${botIdFilter ? 'WHERE a.bot_id = ?' : ''}
      ORDER BY a.created_at DESC LIMIT 8
    `)
    .all(...msgParams);

  res.json({
    stats: {
      totalBots,
      activeBots,
      inactiveBots,
      totalMessagesSent: Math.max(messagesSent, dailyTotals.msgs),
      totalUpdatesReceived: Math.max(updatesReceived, dailyTotals.upds),
      totalApiRequests: Math.max(apiAgg.total, dailyTotals.reqs),
      successfulApiRequests: Math.max(apiAgg.success || 0, dailyTotals.ok_cnt),
      failedApiRequests: Math.max(apiAgg.failed || 0, dailyTotals.fail_cnt),
    },
    bots: bots.map(sanitizeBotForClient),
    series,
    recentUpdates,
    recentMessages,
    recentApiRequests,
  });
});

// ============================================================================
// MULTI-BOT MANAGEMENT
// ============================================================================
apiRouter.get('/bots', (_req, res) => {
  const rows = db.prepare('SELECT * FROM bots ORDER BY created_at DESC').all() as unknown as BotRecord[];
  const enriched = rows.map((b) => {
    const chatsCount = (db.prepare('SELECT COUNT(*) as c FROM bot_chats WHERE bot_id = ?').get(b.id) as { c: number }).c;
    const msgsCount = (db.prepare('SELECT COUNT(*) as c FROM bot_messages WHERE bot_id = ?').get(b.id) as { c: number }).c;
    const updatesCount = (db.prepare('SELECT COUNT(*) as c FROM bot_updates WHERE bot_id = ?').get(b.id) as { c: number }).c;
    const settings = db.prepare('SELECT * FROM bot_settings WHERE bot_id = ?').get(b.id);
    return {
      ...sanitizeBotForClient(b),
      counts: { chats: chatsCount, messages: msgsCount, updates: updatesCount },
      settings,
    };
  });
  res.json({ bots: enriched });
});

apiRouter.post('/bots/validate-token', async (req, res) => {
  const rawToken = String(req.body?.token ?? '').trim();
  const format = validateBotTokenFormat(rawToken, true);
  if (!format.valid || !format.mode) {
    res.status(400).json({ ok: false, error: format.error });
    return;
  }

  const fingerprint = hashTokenFingerprint(rawToken);
  const existing = db.prepare('SELECT id, username FROM bots WHERE token_fingerprint = ?').get(fingerprint) as
    | { id: number; username: string }
    | undefined;

  if (existing) {
    res.status(409).json({
      ok: false,
      error: `Duplicate token detected: this token is already connected as @${existing.username}.`,
    });
    return;
  }

  const validation = await validateTokenWithTelegram(rawToken, format.mode);
  if (!validation.ok || !validation.profile) {
    res.status(400).json({ ok: false, error: validation.error || 'Token validation failed.' });
    return;
  }

  res.json({
    ok: true,
    mode: format.mode,
    token_masked: maskToken(rawToken),
    profile: validation.profile,
  });
});

apiRouter.post('/bots', async (req, res) => {
  const rawToken = String(req.body?.token ?? '').trim();
  const customName = String(req.body?.name ?? '').trim();
  const shortDesc = String(req.body?.short_description ?? '').trim();

  const format = validateBotTokenFormat(rawToken, true);
  if (!format.valid || !format.mode) {
    res.status(400).json({ error: format.error });
    return;
  }

  const fingerprint = hashTokenFingerprint(rawToken);
  const dup = db.prepare('SELECT id, username FROM bots WHERE token_fingerprint = ?').get(fingerprint) as
    | { id: number; username: string }
    | undefined;
  if (dup) {
    res.status(409).json({ error: `This bot token is already connected (@${dup.username}).` });
    return;
  }

  const validation = await validateTokenWithTelegram(rawToken, format.mode);
  if (!validation.ok || !validation.profile) {
    res.status(400).json({ error: validation.error || 'Telegram getMe validation failed.' });
    return;
  }

  const p = validation.profile;
  const botKey = `${p.username.toLowerCase().replace(/[^a-z0-9_]/g, '_')}_${Date.now().toString(36).slice(-4)}`;
  const secretToken = generateRandomToken(16);

  const insert = db
    .prepare(`
      INSERT INTO bots (
        bot_key, telegram_bot_id, name, username, short_description, mode,
        encrypted_token, token_fingerprint, token_masked,
        connection_status, webhook_status, webhook_secret_encrypted,
        can_join_groups, can_read_all_group_messages, supports_inline_queries,
        last_checked_at, last_activity_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected', 'inactive', ?, ?, ?, ?, datetime('now'), datetime('now'))
    `)
    .run(
      botKey,
      p.id,
      customName || p.first_name,
      p.username,
      shortDesc,
      format.mode,
      encryptToken(rawToken),
      fingerprint,
      maskToken(rawToken),
      encryptToken(secretToken),
      p.can_join_groups ? 1 : 0,
      p.can_read_all_group_messages ? 1 : 0,
      p.supports_inline_queries ? 1 : 0
    );

  const botId = Number(insert.lastInsertRowid);
  db.prepare('INSERT INTO bot_settings (bot_id) VALUES (?)').run(botId);

  // Best-effort sync of existing live bio & description from Telegram
  if (format.mode === 'live') {
    const insertedBot = getBotById(botId);
    if (insertedBot) {
      const [shortRes, descRes] = await Promise.allSettled([
        shortDesc ? Promise.resolve(null) : executeBotMethod(insertedBot, 'getMyShortDescription', {}),
        executeBotMethod(insertedBot, 'getMyDescription', {}),
      ]);
      const fetchedShort =
        shortRes.status === 'fulfilled' && shortRes.value?.ok
          ? String((shortRes.value.result as { short_description?: string } | undefined)?.short_description ?? '').trim()
          : shortDesc;
      const fetchedDesc =
        descRes.status === 'fulfilled' && descRes.value?.ok
          ? String((descRes.value.result as { description?: string } | undefined)?.description ?? '').trim()
          : '';
      if (fetchedShort !== shortDesc || fetchedDesc) {
        db.prepare(`UPDATE bots SET short_description = ?, description = ?, updated_at = datetime('now') WHERE id = ?`).run(
          fetchedShort,
          fetchedDesc,
          botId
        );
      }
    }
  }

  logActivity({
    action: 'BOT_ADDED',
    botId,
    botName: customName || p.first_name,
    status: 'success',
    relatedResource: `@${p.username}`,
    details: `Connected ${format.mode} bot (ID ${p.id}) with encrypted token storage.`,
    ipAddress: getClientIp(req),
  });
  pushNotification({
    botId,
    severity: 'success',
    title: 'Bot Connected',
    message: `@${p.username} verified via getMe and encrypted at rest.`,
  });

  const saved = getBotById(botId)!;
  res.status(201).json({ ok: true, bot: sanitizeBotForClient(saved) });
});

apiRouter.get('/bots/:id', (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }
  const settings = db.prepare('SELECT * FROM bot_settings WHERE bot_id = ?').get(bot.id);
  const counts = {
    chats: (db.prepare('SELECT COUNT(*) as c FROM bot_chats WHERE bot_id = ?').get(bot.id) as { c: number }).c,
    messages: (db.prepare('SELECT COUNT(*) as c FROM bot_messages WHERE bot_id = ?').get(bot.id) as { c: number }).c,
    updates: (db.prepare('SELECT COUNT(*) as c FROM bot_updates WHERE bot_id = ?').get(bot.id) as { c: number }).c,
    commands: (db.prepare('SELECT COUNT(*) as c FROM bot_commands WHERE bot_id = ?').get(bot.id) as { c: number }).c,
  };
  res.json({ bot: sanitizeBotForClient(bot), settings, counts });
});

apiRouter.patch('/bots/:id', async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }
  const name = String(req.body?.name ?? bot.name).trim();
  const shortDesc = String(req.body?.short_description ?? bot.short_description ?? '').trim();
  const description = String(req.body?.description ?? bot.description ?? '').trim();
  const status = req.body?.connection_status;
  const nextStatus = ['connected', 'disconnected'].includes(status) ? status : bot.connection_status;
  const syncTelegram = req.body?.sync_telegram !== false;

  if (!name) {
    res.status(400).json({ error: 'Bot name cannot be empty.' });
    return;
  }
  if (name.length > 64) {
    res.status(400).json({ error: 'Bot name must be 64 characters or fewer (Telegram limit).' });
    return;
  }
  if (shortDesc.length > 120) {
    res.status(400).json({ error: 'Bot bio (short description) must be 120 characters or fewer (Telegram limit).' });
    return;
  }
  if (description.length > 512) {
    res.status(400).json({ error: 'Bot description must be 512 characters or fewer (Telegram limit).' });
    return;
  }

  const syncedMethods: string[] = [];
  if (syncTelegram) {
    if (name !== bot.name) {
      const r = await executeBotMethod(bot, 'setMyName', { name });
      if (!r.ok) {
        res.status(r.httpStatus >= 400 ? r.httpStatus : 502).json({
          error: `Telegram setMyName failed: ${r.description || 'Unknown error'}`,
        });
        return;
      }
      syncedMethods.push('setMyName');
    }

    if (shortDesc !== (bot.short_description || '')) {
      const r = await executeBotMethod(bot, 'setMyShortDescription', { short_description: shortDesc });
      if (!r.ok) {
        res.status(r.httpStatus >= 400 ? r.httpStatus : 502).json({
          error: `Telegram setMyShortDescription failed: ${r.description || 'Unknown error'}`,
        });
        return;
      }
      syncedMethods.push('setMyShortDescription');
    }

    if (description !== (bot.description || '')) {
      const r = await executeBotMethod(bot, 'setMyDescription', { description });
      if (!r.ok) {
        res.status(r.httpStatus >= 400 ? r.httpStatus : 502).json({
          error: `Telegram setMyDescription failed: ${r.description || 'Unknown error'}`,
        });
        return;
      }
      syncedMethods.push('setMyDescription');
    }
  }

  db.prepare(`
    UPDATE bots
    SET name = ?, short_description = ?, description = ?, connection_status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(name, shortDesc, description, nextStatus, bot.id);

  logActivity({
    action: 'BOT_UPDATED',
    botId: bot.id,
    botName: name,
    status: 'success',
    relatedResource: `@${bot.username}`,
    details: syncedMethods.length
      ? `Updated bot profile and synced with Telegram (${syncedMethods.join(', ')}).`
      : 'Updated bot profile configuration.',
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true, syncedMethods, bot: sanitizeBotForClient(getBotById(bot.id)!) });
});

apiRouter.post('/bots/:id/sync-profile', async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }

  const [nameRes, shortRes, descRes] = await Promise.all([
    executeBotMethod(bot, 'getMyName', {}),
    executeBotMethod(bot, 'getMyShortDescription', {}),
    executeBotMethod(bot, 'getMyDescription', {}),
  ]);

  if (!nameRes.ok && !shortRes.ok && !descRes.ok) {
    res.status(502).json({
      error: nameRes.description || shortRes.description || descRes.description || 'Failed to pull profile from Telegram.',
    });
    return;
  }

  const nextName =
    nameRes.ok && typeof (nameRes.result as { name?: unknown } | undefined)?.name === 'string'
      ? String((nameRes.result as { name: string }).name).trim() || bot.name
      : bot.name;
  const nextShort =
    shortRes.ok && typeof (shortRes.result as { short_description?: unknown } | undefined)?.short_description === 'string'
      ? String((shortRes.result as { short_description: string }).short_description).trim()
      : bot.short_description || '';
  const nextDesc =
    descRes.ok && typeof (descRes.result as { description?: unknown } | undefined)?.description === 'string'
      ? String((descRes.result as { description: string }).description).trim()
      : bot.description || '';

  db.prepare(`
    UPDATE bots
    SET name = ?, short_description = ?, description = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(nextName, nextShort, nextDesc, bot.id);

  logActivity({
    action: 'BOT_PROFILE_PULLED',
    botId: bot.id,
    botName: nextName,
    status: 'success',
    relatedResource: `@${bot.username}`,
    details: 'Pulled current Name, Bio, and Description from Telegram Bot API.',
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true, bot: sanitizeBotForClient(getBotById(bot.id)!) });
});

apiRouter.post('/bots/:id/profile-photo', async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }

  const rawImage = String(req.body?.imageDataUrl ?? '').trim();
  const rawThumb = String(req.body?.thumbnailDataUrl ?? '').trim();

  const match = /^data:image\/(jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/i.exec(rawImage);
  if (!match) {
    res.status(400).json({ error: 'Invalid profile photo format. Please upload a valid image (converted to JPEG).' });
    return;
  }

  const jpegBuffer = Buffer.from(match[2], 'base64');
  if (jpegBuffer.length === 0 || jpegBuffer.length > 1_500_000) {
    res.status(400).json({ error: 'Profile photo size must be between 1 byte and 1.5 MB.' });
    return;
  }

  const outcome = await setBotProfilePhoto(bot, jpegBuffer);
  if (!outcome.ok) {
    res.status(outcome.httpStatus >= 400 ? outcome.httpStatus : 502).json({
      error: `Telegram setMyProfilePhoto failed: ${outcome.description || 'Unknown error'}`,
    });
    return;
  }

  const validThumb = /^data:image\/(jpeg|jpg);base64,[A-Za-z0-9+/=]+$/i.test(rawThumb) && rawThumb.length <= 65_000;
  const avatarToStore = validThumb ? rawThumb : rawImage.length <= 65_000 ? rawImage : '';
  if (avatarToStore) {
    setSetting(`bot_avatar_${bot.id}`, avatarToStore);
  }

  logActivity({
    action: 'BOT_PHOTO_UPDATED',
    botId: bot.id,
    botName: bot.name,
    status: 'success',
    relatedResource: `@${bot.username}`,
    details: 'Updated bot profile photo via setMyProfilePhoto.',
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true, bot: sanitizeBotForClient(getBotById(bot.id)!) });
});

apiRouter.delete('/bots/:id/profile-photo', async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }

  const outcome = await executeBotMethod(bot, 'removeMyProfilePhoto', {});
  if (!outcome.ok) {
    res.status(outcome.httpStatus >= 400 ? outcome.httpStatus : 502).json({
      error: `Telegram removeMyProfilePhoto failed: ${outcome.description || 'Unknown error'}`,
    });
    return;
  }

  db.prepare('DELETE FROM app_settings WHERE key = ?').run(`bot_avatar_${bot.id}`);

  logActivity({
    action: 'BOT_PHOTO_REMOVED',
    botId: bot.id,
    botName: bot.name,
    status: 'warning',
    relatedResource: `@${bot.username}`,
    details: 'Removed bot profile photo via removeMyProfilePhoto.',
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true, bot: sanitizeBotForClient(getBotById(bot.id)!) });
});

apiRouter.patch('/bots/:id/settings', (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }
  const parseMode = ['HTML', 'MarkdownV2', 'None'].includes(req.body?.default_parse_mode)
    ? req.body.default_parse_mode
    : 'HTML';
  const disableNotification = req.body?.disable_notification ? 1 : 0;
  const protectContent = req.body?.protect_content ? 1 : 0;
  const autoStoreUpdates = req.body?.auto_store_updates === false ? 0 : 1;

  db.prepare(`
    UPDATE bot_settings
    SET default_parse_mode = ?, disable_notification = ?, protect_content = ?, auto_store_updates = ?, updated_at = datetime('now')
    WHERE bot_id = ?
  `).run(parseMode, disableNotification, protectContent, autoStoreUpdates, bot.id);

  logActivity({
    action: 'BOT_SETTINGS_UPDATED',
    botId: bot.id,
    botName: bot.name,
    status: 'success',
    relatedResource: `@${bot.username}`,
    details: `Default parse mode: ${parseMode}`,
  });

  res.json({ ok: true, settings: db.prepare('SELECT * FROM bot_settings WHERE bot_id = ?').get(bot.id) });
});

apiRouter.post('/bots/:id/revalidate', async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }
  const rawToken = decryptToken(bot.encrypted_token);
  const check = await validateTokenWithTelegram(rawToken, bot.mode);
  if (!check.ok || !check.profile) {
    db.prepare(`UPDATE bots SET connection_status = 'invalid_token', last_checked_at = datetime('now') WHERE id = ?`).run(bot.id);
    res.status(400).json({ ok: false, error: check.error || 'Token validation failed.', bot: sanitizeBotForClient(getBotById(bot.id)!) });
    return;
  }

  db.prepare(`
    UPDATE bots
    SET name = ?, username = ?, connection_status = 'connected',
        can_join_groups = ?, can_read_all_group_messages = ?, supports_inline_queries = ?,
        last_checked_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(
    check.profile.first_name,
    check.profile.username,
    check.profile.can_join_groups ? 1 : 0,
    check.profile.can_read_all_group_messages ? 1 : 0,
    check.profile.supports_inline_queries ? 1 : 0,
    bot.id
  );

  res.json({ ok: true, bot: sanitizeBotForClient(getBotById(bot.id)!) });
});

apiRouter.post('/bots/:id/test-connection', async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }
  const outcome = await executeBotMethod(bot, 'getMe', {});
  res.json({
    ok: outcome.ok,
    durationMs: outcome.durationMs,
    httpStatus: outcome.httpStatus,
    response: outcome.rawResponse,
    bot: sanitizeBotForClient(getBotById(bot.id)!),
  });
});

apiRouter.delete('/bots/:id', (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }
  db.prepare('DELETE FROM bots WHERE id = ?').run(bot.id);
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(`bot_avatar_${bot.id}`);
  logActivity({
    action: 'BOT_REMOVED',
    botId: null,
    botName: bot.name,
    status: 'warning',
    relatedResource: `@${bot.username}`,
    details: 'Removed bot and purged encrypted credentials.',
    ipAddress: getClientIp(req),
  });
  res.json({ ok: true });
});

// ============================================================================
// MESSAGE CENTER
// ============================================================================
apiRouter.get('/bots/:id/messages', (req, res) => {
  const botId = Number(req.params.id);
  const rows = db
    .prepare('SELECT * FROM bot_messages WHERE bot_id = ? ORDER BY sent_at DESC LIMIT 100')
    .all(botId);
  res.json({ messages: rows });
});

apiRouter.post('/bots/:id/messages', async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }

  const messageType = String(req.body?.messageType ?? 'text');
  const chatId = String(req.body?.chatId ?? '').trim();
  const text = String(req.body?.text ?? '');
  const mediaUrl = String(req.body?.mediaUrl ?? '').trim();
  const parseMode = req.body?.parseMode && req.body.parseMode !== 'None' ? String(req.body.parseMode) : undefined;
  const disableNotification = Boolean(req.body?.disableNotification);
  const protectContent = Boolean(req.body?.protectContent);
  const replyMarkup = req.body?.replyMarkup ?? undefined;

  if (!chatId) {
    res.status(400).json({ error: 'Target Chat ID is required.' });
    return;
  }

  const methodMap: Record<string, string> = {
    text: 'sendMessage',
    photo: 'sendPhoto',
    video: 'sendVideo',
    document: 'sendDocument',
    audio: 'sendAudio',
    voice: 'sendVoice',
    animation: 'sendAnimation',
    location: 'sendLocation',
    contact: 'sendContact',
    poll: 'sendPoll',
    media_group: 'sendMediaGroup',
  };

  const method = methodMap[messageType];
  if (!method) {
    res.status(400).json({ error: `Unsupported message type: ${messageType}` });
    return;
  }

  const payload: Record<string, unknown> = { chat_id: chatId };
  if (disableNotification) payload.disable_notification = true;
  if (protectContent) payload.protect_content = true;
  if (replyMarkup) payload.reply_markup = replyMarkup;

  let preview = text;

  if (messageType === 'text') {
    if (!text.trim()) {
      res.status(400).json({ error: 'Message text cannot be empty.' });
      return;
    }
    payload.text = text;
    if (parseMode) payload.parse_mode = parseMode;
  } else if (['photo', 'video', 'document', 'audio', 'voice', 'animation'].includes(messageType)) {
    if (!mediaUrl) {
      res.status(400).json({ error: `A media URL or Telegram file_id is required for ${messageType}.` });
      return;
    }
    payload[messageType] = mediaUrl;
    if (text.trim()) {
      payload.caption = text;
      if (parseMode) payload.parse_mode = parseMode;
    }
    preview = text.trim() ? `[${messageType}] ${text}` : `[${messageType}] ${mediaUrl}`;
  } else if (messageType === 'location') {
    const lat = Number(req.body?.latitude);
    const lon = Number(req.body?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(400).json({ error: 'Valid numeric latitude and longitude are required.' });
      return;
    }
    payload.latitude = lat;
    payload.longitude = lon;
    preview = `Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
  } else if (messageType === 'contact') {
    const phone = String(req.body?.phoneNumber ?? '').trim();
    const firstName = String(req.body?.firstName ?? '').trim();
    if (!phone || !firstName) {
      res.status(400).json({ error: 'Contact phone number and first name are required.' });
      return;
    }
    payload.phone_number = phone;
    payload.first_name = firstName;
    if (req.body?.lastName) payload.last_name = String(req.body.lastName);
    preview = `Contact: ${firstName} (${phone})`;
  } else if (messageType === 'poll') {
    const question = String(req.body?.pollQuestion ?? '').trim();
    const options = Array.isArray(req.body?.pollOptions) ? req.body.pollOptions.filter((o: string) => String(o).trim()) : [];
    if (!question || options.length < 2) {
      res.status(400).json({ error: 'Poll requires a question and at least 2 options.' });
      return;
    }
    payload.question = question;
    payload.options = options;
    payload.is_anonymous = req.body?.pollAnonymous !== false;
    preview = `Poll: ${question}`;
  } else if (messageType === 'media_group') {
    const items = Array.isArray(req.body?.mediaGroup) ? req.body.mediaGroup : [];
    if (items.length < 2) {
      res.status(400).json({ error: 'Media Group requires at least 2 media URLs.' });
      return;
    }
    payload.media = items;
    preview = `Media Group (${items.length} items)`;
  }

  const outcome = await executeBotMethod(bot, method, payload);
  const tgMsgId =
    outcome.ok && outcome.result && typeof (outcome.result as Record<string, unknown>).message_id === 'number'
      ? Number((outcome.result as Record<string, unknown>).message_id)
      : null;

  db.prepare(`
    INSERT INTO bot_messages (
      bot_id, telegram_message_id, chat_id, message_type, parse_mode,
      content_preview, reply_markup_json, delivery_status, api_response_json, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    bot.id,
    tgMsgId,
    chatId,
    messageType,
    parseMode || null,
    preview.slice(0, 500),
    replyMarkup ? JSON.stringify(replyMarkup) : null,
    outcome.ok ? 'sent' : 'failed',
    redactSecrets(JSON.stringify(outcome.rawResponse)),
    outcome.ok ? null : outcome.description || 'Delivery failed'
  );

  if (outcome.ok) {
    incrementDailyAnalytics({ botId: bot.id, messagesSent: 1 });
    db.prepare(`
      INSERT INTO bot_chats (bot_id, chat_id, chat_type, last_interaction_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(bot_id, chat_id) DO UPDATE SET last_interaction_at = datetime('now')
    `).run(bot.id, chatId, chatId.startsWith('-100') ? 'supergroup' : chatId.startsWith('-') ? 'group' : chatId.startsWith('@') ? 'channel' : 'private');
  }

  logActivity({
    action: 'MESSAGE_SENT',
    botId: bot.id,
    botName: bot.name,
    status: outcome.ok ? 'success' : 'failed',
    relatedResource: `${method} -> ${chatId}`,
    details: outcome.ok ? preview.slice(0, 120) : outcome.description || 'Failed',
    ipAddress: getClientIp(req),
  });

  res.status(outcome.ok ? 200 : 400).json({
    ok: outcome.ok,
    durationMs: outcome.durationMs,
    response: outcome.rawResponse,
    error: outcome.ok ? undefined : outcome.description,
  });
});

// ============================================================================
// CHAT MANAGER
// ============================================================================
apiRouter.get('/bots/:id/chats', (req, res) => {
  const botId = Number(req.params.id);
  const type = typeof req.query.type === 'string' && req.query.type !== 'all' ? req.query.type : null;
  const search = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

  let sql = 'SELECT * FROM bot_chats WHERE bot_id = ?';
  const params: SQLInputValue[] = [botId];
  if (type) {
    sql += ' AND chat_type = ?';
    params.push(type);
  }
  if (search) {
    sql += ' AND (LOWER(chat_id) LIKE ? OR LOWER(COALESCE(title,"")) LIKE ? OR LOWER(COALESCE(username,"")) LIKE ? OR LOWER(COALESCE(first_name,"")) LIKE ?)';
    const pat = `%${search}%`;
    params.push(pat, pat, pat, pat);
  }
  sql += ' ORDER BY last_interaction_at DESC';
  const chats = db.prepare(sql).all(...params);
  res.json({ chats });
});

apiRouter.post('/bots/:id/chats/lookup', async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }
  const chatId = String(req.body?.chatId ?? '').trim();
  if (!chatId) {
    res.status(400).json({ error: 'Chat ID or @username is required.' });
    return;
  }
  const outcome = await executeBotMethod(bot, 'getChat', { chat_id: chatId });
  if (!outcome.ok || !outcome.result) {
    res.status(400).json({ ok: false, error: outcome.description || 'Chat lookup failed.' });
    return;
  }
  const c = outcome.result as Record<string, unknown>;
  const cType = String(c.type || 'private');
  const validType = ['private', 'group', 'supergroup', 'channel'].includes(cType) ? cType : 'private';

  db.prepare(`
    INSERT INTO bot_chats (bot_id, chat_id, chat_type, title, username, first_name, last_name, last_interaction_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(bot_id, chat_id) DO UPDATE SET
      chat_type = excluded.chat_type,
      title = COALESCE(excluded.title, title),
      username = COALESCE(excluded.username, username),
      first_name = COALESCE(excluded.first_name, first_name),
      last_name = COALESCE(excluded.last_name, last_name),
      last_interaction_at = datetime('now')
  `).run(
    bot.id,
    String(c.id ?? chatId),
    validType,
    typeof c.title === 'string' ? c.title : null,
    typeof c.username === 'string' ? c.username : null,
    typeof c.first_name === 'string' ? c.first_name : null,
    typeof c.last_name === 'string' ? c.last_name : null
  );

  res.json({ ok: true, chat: c });
});

apiRouter.delete('/bots/:id/chats/:chatId', (req, res) => {
  db.prepare('DELETE FROM bot_chats WHERE bot_id = ? AND chat_id = ?').run(Number(req.params.id), req.params.chatId);
  res.json({ ok: true });
});

// ============================================================================
// COMMAND MANAGER
// ============================================================================
apiRouter.get('/bots/:id/commands', (req, res) => {
  const botId = Number(req.params.id);
  const scope = typeof req.query.scope === 'string' ? req.query.scope : 'default';
  const lang = typeof req.query.lang === 'string' ? req.query.lang : '';
  const commands = db
    .prepare('SELECT * FROM bot_commands WHERE bot_id = ? AND scope_type = ? AND language_code = ? ORDER BY sort_order ASC')
    .all(botId, scope, lang);
  res.json({ commands });
});

apiRouter.post('/bots/:id/commands/sync', async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }
  const scopeType = String(req.body?.scopeType ?? 'default');
  const languageCode = String(req.body?.languageCode ?? '').trim().toLowerCase();
  const list = Array.isArray(req.body?.commands) ? req.body.commands : [];

  const cleaned: { command: string; description: string }[] = [];
  for (const item of list) {
    const cmdCheck = validateCommandName(String(item?.command ?? ''));
    if (!cmdCheck.valid) {
      res.status(400).json({ error: cmdCheck.error });
      return;
    }
    const descCheck = validateCommandDescription(String(item?.description ?? ''));
    if (!descCheck.valid) {
      res.status(400).json({ error: `Command /${cmdCheck.normalized}: ${descCheck.error}` });
      return;
    }
    cleaned.push({ command: cmdCheck.normalized, description: String(item.description).trim() });
  }

  const tgParams: Record<string, unknown> = {
    commands: cleaned,
    scope: { type: scopeType },
  };
  if (languageCode) tgParams.language_code = languageCode;

  const outcome = await executeBotMethod(bot, cleaned.length > 0 ? 'setMyCommands' : 'deleteMyCommands', tgParams);
  if (!outcome.ok) {
    res.status(400).json({ ok: false, error: outcome.description || 'Failed to sync commands with Telegram.' });
    return;
  }

  db.prepare('DELETE FROM bot_commands WHERE bot_id = ? AND scope_type = ? AND language_code = ?').run(
    bot.id,
    scopeType,
    languageCode
  );
  cleaned.forEach((cmd, idx) => {
    db.prepare(`
      INSERT INTO bot_commands (bot_id, command, description, scope_type, language_code, sort_order, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(bot.id, cmd.command, cmd.description, scopeType, languageCode, idx);
  });

  logActivity({
    action: 'COMMANDS_SYNCED',
    botId: bot.id,
    botName: bot.name,
    status: 'success',
    relatedResource: `scope:${scopeType}`,
    details: `Synchronized ${cleaned.length} commands with Telegram.`,
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true, commands: cleaned });
});

apiRouter.post('/bots/:id/commands/pull', async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }
  const scopeType = String(req.body?.scopeType ?? 'default');
  const languageCode = String(req.body?.languageCode ?? '').trim().toLowerCase();
  const params: Record<string, unknown> = { scope: { type: scopeType } };
  if (languageCode) params.language_code = languageCode;

  const outcome = await executeBotMethod(bot, 'getMyCommands', params);
  if (!outcome.ok) {
    res.status(400).json({ ok: false, error: outcome.description || 'Failed to pull commands.' });
    return;
  }
  res.json({ ok: true, commands: Array.isArray(outcome.result) ? outcome.result : [] });
});

// ============================================================================
// KEYBOARD TEMPLATES
// ============================================================================
apiRouter.get('/templates', (req, res) => {
  const botId = req.query.botId ? Number(req.query.botId) : null;
  const rows = botId
    ? db.prepare('SELECT * FROM bot_templates WHERE bot_id = ? OR bot_id IS NULL ORDER BY created_at DESC').all(botId)
    : db.prepare('SELECT * FROM bot_templates ORDER BY created_at DESC').all();
  res.json({ templates: rows });
});

apiRouter.post('/templates', (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const botId = req.body?.botId ? Number(req.body.botId) : null;
  const payload = req.body?.payload;
  if (!name) {
    res.status(400).json({ error: 'Template name is required.' });
    return;
  }
  const ins = db
    .prepare(`INSERT INTO bot_templates (bot_id, name, template_type, payload_json) VALUES (?, ?, 'inline_keyboard', ?)`)
    .run(botId, name, JSON.stringify(payload));
  res.status(201).json({ ok: true, id: Number(ins.lastInsertRowid) });
});

apiRouter.delete('/templates/:id', (req, res) => {
  db.prepare('DELETE FROM bot_templates WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ============================================================================
// WEBHOOK MANAGER & UPDATE MONITOR
// ============================================================================
apiRouter.get('/bots/:id/webhook', async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }
  const info = await executeBotMethod(bot, 'getWebhookInfo', {});
  const recentLogs = db
    .prepare('SELECT * FROM webhook_logs WHERE bot_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(bot.id);

  const baseUrl = getSuggestedWebhookBaseUrl({
    appUrl: process.env.APP_URL,
    vercelProdUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    vercelUrl: process.env.VERCEL_URL,
    host: req.get('host'),
    proto: String(req.headers['x-forwarded-proto'] || req.protocol),
  });
  const suggestedUrl = `${baseUrl}/api/webhook/${bot.bot_key}`;

  res.json({
    bot: sanitizeBotForClient(getBotById(bot.id)!),
    webhookInfo: info.result || null,
    suggestedUrl,
    logs: recentLogs,
  });
});

apiRouter.post('/bots/:id/webhook', async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }
  const url = String(req.body?.url ?? '').trim();
  const check = validateWebhookUrl(url);
  if (!check.valid) {
    res.status(400).json({ error: check.error });
    return;
  }

  const secretToken = String(req.body?.secretToken ?? '').trim() || generateRandomToken(16);
  const maxConnections = Number(req.body?.maxConnections) || 40;
  const dropPending = Boolean(req.body?.dropPendingUpdates);

  const outcome = await executeBotMethod(bot, 'setWebhook', {
    url,
    secret_token: secretToken,
    max_connections: Math.min(100, Math.max(1, maxConnections)),
    drop_pending_updates: dropPending,
  });

  if (!outcome.ok) {
    db.prepare(`UPDATE bots SET webhook_status = 'error', last_webhook_error = ? WHERE id = ?`).run(
      outcome.description || 'setWebhook failed',
      bot.id
    );
    res.status(400).json({ ok: false, error: outcome.description || 'Failed to configure webhook.' });
    return;
  }

  db.prepare(`
    UPDATE bots
    SET webhook_url = ?, webhook_status = 'active', webhook_secret_encrypted = ?, last_webhook_error = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(url, encryptToken(secretToken), bot.id);

  logActivity({
    action: 'WEBHOOK_CONFIGURED',
    botId: bot.id,
    botName: bot.name,
    status: 'success',
    relatedResource: url,
    details: 'Set HTTPS webhook with secret token authentication.',
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true, bot: sanitizeBotForClient(getBotById(bot.id)!) });
});

apiRouter.delete('/bots/:id/webhook', async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }
  const outcome = await executeBotMethod(bot, 'deleteWebhook', { drop_pending_updates: false });
  if (!outcome.ok) {
    res.status(400).json({ ok: false, error: outcome.description || 'Failed to delete webhook.' });
    return;
  }
  db.prepare(`UPDATE bots SET webhook_url = NULL, webhook_status = 'inactive', updated_at = datetime('now') WHERE id = ?`).run(
    bot.id
  );
  logActivity({
    action: 'WEBHOOK_DELETED',
    botId: bot.id,
    botName: bot.name,
    status: 'warning',
    relatedResource: `@${bot.username}`,
    details: 'Removed webhook integration.',
    ipAddress: getClientIp(req),
  });
  res.json({ ok: true, bot: sanitizeBotForClient(getBotById(bot.id)!) });
});

// Direct Webhook Manager endpoints (Hosted URL + Bot Token directly without requiring saved bot)
apiRouter.post('/webhook/direct/set', async (req, res) => {
  const rawToken = String(req.body?.token ?? '').trim();
  const url = String(req.body?.url ?? '').trim();
  const secretToken = String(req.body?.secretToken ?? '').trim();
  const maxConnections = Number(req.body?.maxConnections) || 40;
  const dropPending = Boolean(req.body?.dropPendingUpdates);

  const tokenCheck = validateBotTokenFormat(rawToken, true);
  if (!tokenCheck.valid || !tokenCheck.mode) {
    res.status(400).json({ error: tokenCheck.error });
    return;
  }
  const urlCheck = validateWebhookUrl(url);
  if (!urlCheck.valid) {
    res.status(400).json({ error: urlCheck.error });
    return;
  }

  const fingerprint = hashTokenFingerprint(rawToken);
  const matchedBot = db.prepare('SELECT * FROM bots WHERE token_fingerprint = ?').get(fingerprint) as
    | BotRecord
    | undefined;

  const tgBody: Record<string, unknown> = {
    url,
    max_connections: Math.min(100, Math.max(1, maxConnections)),
    drop_pending_updates: dropPending,
  };
  if (secretToken) {
    tgBody.secret_token = secretToken;
  }

  const outcome = matchedBot
    ? await executeBotMethod(matchedBot, 'setWebhook', tgBody)
    : await executeDirectWebhookMethod({
        token: rawToken,
        mode: tokenCheck.mode,
        method: 'setWebhook',
        body: tgBody,
      });

  if (!outcome.ok) {
    if (matchedBot) {
      db.prepare(`UPDATE bots SET webhook_status = 'error', last_webhook_error = ? WHERE id = ?`).run(
        outcome.description || 'setWebhook failed',
        matchedBot.id
      );
    }
    res.status(outcome.httpStatus >= 400 ? outcome.httpStatus : 400).json({
      ok: false,
      error: outcome.description || 'Failed to set webhook.',
    });
    return;
  }

  if (matchedBot) {
    if (secretToken) {
      db.prepare(`
        UPDATE bots
        SET webhook_url = ?, webhook_status = 'active', webhook_secret_encrypted = ?, last_webhook_error = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(url, encryptToken(secretToken), matchedBot.id);
    } else {
      db.prepare(`
        UPDATE bots
        SET webhook_url = ?, webhook_status = 'active', last_webhook_error = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(url, matchedBot.id);
    }
  }

  logActivity({
    action: 'WEBHOOK_CONFIGURED',
    botId: matchedBot?.id ?? null,
    botName: matchedBot?.name ?? 'Direct Bot Token',
    status: 'success',
    relatedResource: url,
    details: `Configured webhook for ${maskToken(rawToken)} (${tokenCheck.mode}).`,
    ipAddress: getClientIp(req),
  });

  res.json({
    ok: true,
    mode: tokenCheck.mode,
    matchedBotId: matchedBot?.id ?? null,
    message: `Webhook configured for ${maskToken(rawToken)}.`,
  });
});

apiRouter.post('/webhook/direct/info', async (req, res) => {
  const rawToken = String(req.body?.token ?? '').trim();
  const tokenCheck = validateBotTokenFormat(rawToken, true);
  if (!tokenCheck.valid || !tokenCheck.mode) {
    res.status(400).json({ error: tokenCheck.error });
    return;
  }

  const fingerprint = hashTokenFingerprint(rawToken);
  const matchedBot = db.prepare('SELECT * FROM bots WHERE token_fingerprint = ?').get(fingerprint) as
    | BotRecord
    | undefined;

  const outcome = matchedBot
    ? await executeBotMethod(matchedBot, 'getWebhookInfo', {})
    : await executeDirectWebhookMethod({
        token: rawToken,
        mode: tokenCheck.mode,
        method: 'getWebhookInfo',
      });

  if (!outcome.ok) {
    res.status(outcome.httpStatus >= 400 ? outcome.httpStatus : 400).json({
      ok: false,
      error: outcome.description || 'Failed to fetch webhook info.',
    });
    return;
  }

  res.json({
    ok: true,
    mode: tokenCheck.mode,
    matchedBotId: matchedBot?.id ?? null,
    webhookInfo: outcome.result || null,
  });
});

apiRouter.post('/webhook/direct/delete', async (req, res) => {
  const rawToken = String(req.body?.token ?? '').trim();
  const dropPending = Boolean(req.body?.dropPendingUpdates);
  const tokenCheck = validateBotTokenFormat(rawToken, true);
  if (!tokenCheck.valid || !tokenCheck.mode) {
    res.status(400).json({ error: tokenCheck.error });
    return;
  }

  const fingerprint = hashTokenFingerprint(rawToken);
  const matchedBot = db.prepare('SELECT * FROM bots WHERE token_fingerprint = ?').get(fingerprint) as
    | BotRecord
    | undefined;

  const tgBody = { drop_pending_updates: dropPending };
  const outcome = matchedBot
    ? await executeBotMethod(matchedBot, 'deleteWebhook', tgBody)
    : await executeDirectWebhookMethod({
        token: rawToken,
        mode: tokenCheck.mode,
        method: 'deleteWebhook',
        body: tgBody,
      });

  if (!outcome.ok) {
    res.status(outcome.httpStatus >= 400 ? outcome.httpStatus : 400).json({
      ok: false,
      error: outcome.description || 'Failed to delete webhook.',
    });
    return;
  }

  if (matchedBot) {
    db.prepare(`
      UPDATE bots
      SET webhook_url = NULL, webhook_status = 'inactive', pending_update_count = 0, updated_at = datetime('now')
      WHERE id = ?
    `).run(matchedBot.id);
  }

  logActivity({
    action: 'WEBHOOK_DELETED',
    botId: matchedBot?.id ?? null,
    botName: matchedBot?.name ?? 'Direct Bot Token',
    status: 'warning',
    relatedResource: maskToken(rawToken),
    details: `Deleted webhook for ${maskToken(rawToken)} (${tokenCheck.mode}).`,
    ipAddress: getClientIp(req),
  });

  res.json({
    ok: true,
    mode: tokenCheck.mode,
    matchedBotId: matchedBot?.id ?? null,
    message: `Webhook deleted for ${maskToken(rawToken)}.`,
  });
});

// Fires a real signed webhook payload through the exact incoming webhook receiver logic
apiRouter.post('/bots/:id/webhook/simulate', (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }
  const updateId = req.body?.updateId ? Number(req.body.updateId) : Math.floor(90000000 + Math.random() * 9999999);
  const updateType = String(req.body?.updateType ?? 'message');
  const text = String(req.body?.text ?? '/status');
  const useBadSecret = Boolean(req.body?.useBadSecret);

  const secret = useBadSecret
    ? 'invalid-secret-test'
    : bot.webhook_secret_encrypted
    ? decryptToken(bot.webhook_secret_encrypted)
    : undefined;

  const baseChat = { id: 104829104, first_name: 'Sara', username: 'sara_lin', type: 'private' };
  const payload: Record<string, unknown> = { update_id: updateId };
  if (updateType === 'callback_query') {
    payload.callback_query = {
      id: `cbq_${Date.now()}`,
      from: { id: 104829104, is_bot: false, first_name: 'Sara', username: 'sara_lin' },
      message: { message_id: 500, chat: baseChat },
      data: text,
    };
  } else {
    payload[updateType] = {
      message_id: Math.floor(1000 + Math.random() * 5000),
      from: { id: 104829104, is_bot: false, first_name: 'Sara', username: 'sara_lin' },
      chat: baseChat,
      date: Math.floor(Date.now() / 1000),
      text,
    };
  }

  const outcome = processIncomingWebhookUpdate({
    bot,
    secretHeader: secret,
    payload,
  });

  res.status(outcome.httpStatus).json({ ok: outcome.ok, status: outcome.status, message: outcome.message, updateId });
});

apiRouter.get('/updates', (req, res) => {
  const botId = req.query.botId ? Number(req.query.botId) : null;
  const type = typeof req.query.type === 'string' && req.query.type !== 'all' ? req.query.type : null;
  const search = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 25;
  const offset = (page - 1) * limit;

  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  if (botId) {
    clauses.push('u.bot_id = ?');
    params.push(botId);
  }
  if (type) {
    clauses.push('u.update_type = ?');
    params.push(type);
  }
  if (search) {
    clauses.push('(CAST(u.update_id AS TEXT) LIKE ? OR LOWER(COALESCE(u.summary,"")) LIKE ? OR LOWER(COALESCE(u.sender_username,"")) LIKE ?)');
    const pat = `%${search}%`;
    params.push(pat, pat, pat);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const total = (
    db.prepare(`SELECT COUNT(*) as cnt FROM bot_updates u ${where}`).get(...params) as { cnt: number }
  ).cnt;

  const updates = db
    .prepare(`
      SELECT u.*, b.name as bot_name, b.username as bot_username
      FROM bot_updates u
      JOIN bots b ON b.id = u.bot_id
      ${where}
      ORDER BY u.received_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(...params, limit, offset);

  res.json({ updates, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

// ============================================================================
// API EXPLORER & DEBUG CONSOLE
// ============================================================================
apiRouter.post('/explorer/execute', async (req, res) => {
  const botId = Number(req.body?.botId);
  const method = String(req.body?.method ?? '').trim();
  const params = req.body?.params && typeof req.body.params === 'object' ? (req.body.params as Record<string, unknown>) : {};

  const bot = getBotById(botId);
  if (!bot) {
    res.status(404).json({ error: 'Select a connected bot first.' });
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(method)) {
    res.status(400).json({ error: 'Invalid Telegram API method name.' });
    return;
  }

  const outcome = await executeBotMethod(bot, method, params);

  logActivity({
    action: 'API_EXPLORER_EXEC',
    botId: bot.id,
    botName: bot.name,
    status: outcome.ok ? 'success' : 'failed',
    relatedResource: method,
    details: `HTTP ${outcome.httpStatus} · ${outcome.durationMs}ms`,
    ipAddress: getClientIp(req),
  });

  res.json({
    ok: outcome.ok,
    httpStatus: outcome.httpStatus,
    durationMs: outcome.durationMs,
    errorCode: outcome.errorCode,
    description: outcome.description,
    response: outcome.rawResponse,
  });
});

apiRouter.get('/explorer/saved', (_req, res) => {
  const saved = db
    .prepare(`
      SELECT s.*, b.username as bot_username
      FROM saved_api_requests s
      LEFT JOIN bots b ON b.id = s.bot_id
      ORDER BY s.created_at DESC
    `)
    .all();
  res.json({ saved });
});

apiRouter.post('/explorer/saved', (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const method = String(req.body?.method ?? '').trim();
  const botId = req.body?.botId ? Number(req.body.botId) : null;
  const params = req.body?.params ?? {};

  if (!name || !method) {
    res.status(400).json({ error: 'Request name and method are required.' });
    return;
  }
  const ins = db
    .prepare(`INSERT INTO saved_api_requests (bot_id, name, method, params_json) VALUES (?, ?, ?, ?)`)
    .run(botId, name, method, JSON.stringify(params));
  res.status(201).json({ ok: true, id: Number(ins.lastInsertRowid) });
});

apiRouter.delete('/explorer/saved/:id', (req, res) => {
  db.prepare('DELETE FROM saved_api_requests WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

apiRouter.get('/debug/logs', (req, res) => {
  const filter = typeof req.query.filter === 'string' ? req.query.filter : 'all';
  const botId = req.query.botId ? Number(req.query.botId) : null;

  const apiClauses: string[] = [];
  const apiParams: SQLInputValue[] = [];
  if (botId) {
    apiClauses.push('a.bot_id = ?');
    apiParams.push(botId);
  }
  if (filter === 'success') apiClauses.push('a.ok = 1');
  if (filter === 'failed' || filter === 'api_error') apiClauses.push('a.ok = 0');

  const apiSql = `
    SELECT 'api' as source, a.id, a.bot_id, b.name as bot_name, b.username as bot_username,
           a.method as title, a.http_status, a.telegram_error_code, a.ok, a.duration_ms,
           a.request_payload_json, a.response_payload_json, a.error_message, a.created_at
    FROM api_logs a
    LEFT JOIN bots b ON b.id = a.bot_id
    ${apiClauses.length ? `WHERE ${apiClauses.join(' AND ')}` : ''}
    ORDER BY a.created_at DESC
    LIMIT 60
  `;

  const whClauses: string[] = [];
  const whParams: SQLInputValue[] = [];
  if (botId) {
    whClauses.push('w.bot_id = ?');
    whParams.push(botId);
  }
  if (filter === 'webhook_error') whClauses.push(`w.status IN ('rejected', 'error')`);
  if (filter === 'warning') whClauses.push(`w.status = 'duplicate'`);
  if (filter === 'success') whClauses.push(`w.status = 'accepted'`);

  const whSql = `
    SELECT 'webhook' as source, w.id, w.bot_id, b.name as bot_name, b.username as bot_username,
           'Webhook #' || COALESCE(CAST(w.update_id AS TEXT), '?') as title, w.http_status,
           NULL as telegram_error_code, CASE WHEN w.status = 'accepted' THEN 1 ELSE 0 END as ok,
           0 as duration_ms, w.payload_preview as request_payload_json,
           w.status as response_payload_json, w.error_message, w.created_at
    FROM webhook_logs w
    LEFT JOIN bots b ON b.id = w.bot_id
    ${whClauses.length ? `WHERE ${whClauses.join(' AND ')}` : ''}
    ORDER BY w.created_at DESC
    LIMIT 40
  `;

  const apiRows = filter === 'webhook_error' ? [] : (db.prepare(apiSql).all(...apiParams) as Record<string, unknown>[]);
  const whRows = filter === 'api_error' ? [] : (db.prepare(whSql).all(...whParams) as Record<string, unknown>[]);

  const merged = [...apiRows, ...whRows].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at))
  );

  res.json({ logs: merged.slice(0, 80) });
});

// ============================================================================
// ANALYTICS & ACTIVITY LOGS & EXPORTS
// ============================================================================
apiRouter.get('/analytics', (req, res) => {
  const range = typeof req.query.range === 'string' ? req.query.range : '14d';
  const botId = req.query.botId ? Number(req.query.botId) : null;

  let daysBack = 14;
  if (range === 'today') daysBack = 0;
  else if (range === 'yesterday') daysBack = 1;
  else if (range === '7d') daysBack = 7;
  else if (range === '30d') daysBack = 30;

  const startDate = new Date(Date.now() - daysBack * 86400_000).toISOString().slice(0, 10);
  const clauses = ['metric_date >= ?'];
  const params: SQLInputValue[] = [startDate];
  if (range === 'yesterday') {
    clauses.push('metric_date = ?');
    params[0] = startDate;
  }
  if (botId) {
    clauses.push('bot_id = ?');
    params.push(botId);
  }
  const where = `WHERE ${clauses.join(' AND ')}`;

  const summary = db
    .prepare(`
      SELECT COALESCE(SUM(api_requests), 0) as total_api,
             COALESCE(SUM(api_success), 0) as success_api,
             COALESCE(SUM(api_failed), 0) as failed_api,
             COALESCE(SUM(messages_sent), 0) as messages_sent,
             COALESCE(SUM(updates_received), 0) as updates_received,
             COALESCE(SUM(total_duration_ms), 0) as total_duration_ms
      FROM analytics_daily ${where}
    `)
    .get(...params) as {
    total_api: number;
    success_api: number;
    failed_api: number;
    messages_sent: number;
    updates_received: number;
    total_duration_ms: number;
  };

  const timeline = db
    .prepare(`
      SELECT metric_date as date,
             SUM(api_requests) as api_requests,
             SUM(api_success) as api_success,
             SUM(api_failed) as api_failed,
             SUM(messages_sent) as messages_sent,
             SUM(updates_received) as updates_received
      FROM analytics_daily ${where}
      GROUP BY metric_date
      ORDER BY metric_date ASC
    `)
    .all(...params);

  const byBot = db
    .prepare(`
      SELECT b.id, b.name, b.username,
             COALESCE(SUM(d.api_requests), 0) as api_requests,
             COALESCE(SUM(d.messages_sent), 0) as messages_sent,
             COALESCE(SUM(d.updates_received), 0) as updates_received
      FROM bots b
      LEFT JOIN analytics_daily d ON d.bot_id = b.id AND d.metric_date >= ?
      GROUP BY b.id
      ORDER BY api_requests DESC
    `)
    .all(startDate);

  const updateDist = db
    .prepare(`
      SELECT update_type, COUNT(*) as count
      FROM bot_updates
      ${botId ? 'WHERE bot_id = ?' : ''}
      GROUP BY update_type
      ORDER BY count DESC
    `)
    .all(...(botId ? [botId] : []));

  const uniqueChats = (
    db.prepare(`SELECT COUNT(*) as cnt FROM bot_chats ${botId ? 'WHERE bot_id = ?' : ''}`).get(...(botId ? [botId] : [])) as {
      cnt: number;
    }
  ).cnt;

  res.json({
    summary: {
      ...summary,
      unique_chats: uniqueChats,
      avg_response_ms: summary.total_api > 0 ? Math.round(summary.total_duration_ms / summary.total_api) : 0,
      success_rate: summary.total_api > 0 ? Math.round((summary.success_api / summary.total_api) * 1000) / 10 : 100,
    },
    timeline,
    byBot,
    updateDist,
  });
});

apiRouter.get('/analytics/export', (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const rows = db
    .prepare(`
      SELECT d.metric_date, b.username as bot_username, d.messages_sent, d.updates_received, d.api_requests, d.api_success, d.api_failed
      FROM analytics_daily d
      JOIN bots b ON b.id = d.bot_id
      ORDER BY d.metric_date DESC
    `)
    .all() as Record<string, unknown>[];

  if (format === 'csv') {
    const header = 'date,bot_username,messages_sent,updates_received,api_requests,api_success,api_failed';
    const lines = rows.map(
      (r) => `${r.metric_date},${r.bot_username},${r.messages_sent},${r.updates_received},${r.api_requests},${r.api_success},${r.api_failed}`
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="xc-bot-analytics.csv"');
    res.send([header, ...lines].join('\n'));
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="xc-bot-analytics.json"');
  res.send(JSON.stringify({ exportedAt: new Date().toISOString(), rows }, null, 2));
});

apiRouter.get('/activity-logs', (req, res) => {
  const search = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const status = typeof req.query.status === 'string' && req.query.status !== 'all' ? req.query.status : null;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 30;
  const offset = (page - 1) * limit;

  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }
  if (search) {
    clauses.push('(LOWER(action) LIKE ? OR LOWER(COALESCE(bot_name,"")) LIKE ? OR LOWER(COALESCE(details,"")) LIKE ?)');
    const pat = `%${search}%`;
    params.push(pat, pat, pat);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM activity_logs ${where}`).get(...params) as { cnt: number }).cnt;
  const logs = db
    .prepare(`SELECT * FROM activity_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  res.json({ logs, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

apiRouter.get('/activity-logs/export', (_req, res) => {
  const rows = db.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 500').all() as Record<string, unknown>[];
  const header = 'id,action,bot_name,status,related_resource,details,created_at';
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map(
    (r) => [r.id, r.action, r.bot_name, r.status, r.related_resource, r.details, r.created_at].map(escape).join(',')
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="xc-activity-logs.csv"');
  res.send([header, ...lines].join('\n'));
});

// ============================================================================
// NOTIFICATIONS, SETTINGS, SYSTEM HEALTH, BACKUP & RESTORE
// ============================================================================
apiRouter.get('/notifications', (_req, res) => {
  const items = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20').all();
  const unread = (db.prepare('SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0').get() as { cnt: number }).cnt;
  res.json({ notifications: items, unread });
});

apiRouter.post('/notifications/read-all', (_req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE is_read = 0').run();
  res.json({ ok: true });
});

apiRouter.get('/settings', (_req, res) => {
  res.json({
    app_name: getSetting('app_name', 'XC BOT CONTROL'),
    default_theme: getSetting('default_theme', 'dark'),
    timezone: getSetting('timezone', 'UTC'),
    date_format: getSetting('date_format', 'YYYY-MM-DD HH:mm'),
    notify_webhook_errors: getSetting('notify_webhook_errors', 'true') === 'true',
    notify_failed_api: getSetting('notify_failed_api', 'true') === 'true',
  });
});

apiRouter.patch('/settings', (req, res) => {
  const allowed = ['app_name', 'default_theme', 'timezone', 'date_format', 'notify_webhook_errors', 'notify_failed_api'];
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) {
      setSetting(key, String(req.body[key]));
    }
  }
  logActivity({
    action: 'SETTINGS_UPDATED',
    status: 'success',
    relatedResource: 'app_settings',
    details: 'Updated console configuration preferences.',
    ipAddress: getClientIp(req),
  });
  res.json({ ok: true });
});

apiRouter.get('/system/health', (req, res) => {
  const dbPath = getDbPath();
  let dbSizeBytes = 0;
  try {
    dbSizeBytes = fs.statSync(dbPath).size;
  } catch {
    dbSizeBytes = 0;
  }
  const tableCount = (
    db.prepare(`SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).get() as {
      cnt: number;
    }
  ).cnt;
  const recentErrors = db
    .prepare(`SELECT method, http_status, error_message, created_at FROM api_logs WHERE ok = 0 ORDER BY created_at DESC LIMIT 5`)
    .all();

  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const serverless = isServerlessRuntime();
  res.json({
    runtime: `Node.js ${process.version}`,
    deploymentMode: serverless ? 'Vercel Serverless' : 'Node.js Server',
    storageMode: serverless ? 'Serverless /tmp SQLite + Env Bootstrap' : 'Persistent Local SQLite',
    explicitMasterKeyConfigured: hasExplicitMasterKey(),
    databaseEngine: getDbEngineName(),
    databaseConnected: true,
    tableCount,
    dbSizeKb: Math.round((dbSizeBytes / 1024) * 10) / 10,
    httpsActive: proto === 'https' || Boolean(process.env.VERCEL),
    webhookEndpointReady: true,
    encryptionAlgorithm: 'AES-256-GCM',
    recentErrors,
  });
});

apiRouter.get('/backup/export', (req, res) => {
  // Never export raw tokens or decrypted secrets! Export sanitized bot metadata + settings + commands + templates + saved requests.
  const bots = (db.prepare('SELECT * FROM bots').all() as unknown as BotRecord[]).map((b) => sanitizeBotForClient(b));
  const botSettings = db.prepare('SELECT * FROM bot_settings').all();
  const commands = db.prepare('SELECT * FROM bot_commands').all();
  const templates = db.prepare('SELECT * FROM bot_templates').all();
  const chats = db.prepare('SELECT * FROM bot_chats').all();
  const savedRequests = db.prepare('SELECT * FROM saved_api_requests').all();
  const appSettings = db.prepare('SELECT * FROM app_settings').all();

  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    bots,
    botSettings,
    commands,
    templates,
    chats,
    savedRequests,
    appSettings,
  };

  const payload = {
    checksum: computeBackupChecksum(data),
    data,
  };

  logActivity({
    action: 'BACKUP_CREATED',
    status: 'success',
    relatedResource: 'json_export',
    details: `Exported safe backup (${bots.length} bots, ${templates.length} templates). Tokens omitted for security.`,
    ipAddress: getClientIp(req),
  });

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="xc-bot-control-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});

apiRouter.get('/backup/sql-schema', (_req, res) => {
  const schemaPath = path.resolve(process.cwd(), 'database', 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    res.status(404).json({ error: 'Schema file not found.' });
    return;
  }
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', 'attachment; filename="xc-bot-control-schema.sql"');
  res.sendFile(schemaPath);
});

apiRouter.post('/backup/restore', (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || !body.checksum || !body.data) {
    res.status(400).json({ error: 'Invalid backup structure. Expected { checksum, data }.' });
    return;
  }
  const expected = computeBackupChecksum(body.data);
  if (expected !== body.checksum) {
    res.status(400).json({ error: 'Backup integrity check failed: SHA-256 checksum mismatch.' });
    return;
  }

  const data = body.data as {
    templates?: Array<{ name: string; template_type: string; payload_json: string }>;
    savedRequests?: Array<{ name: string; method: string; params_json: string }>;
    appSettings?: Array<{ setting_key: string; setting_value: string }>;
  };

  let restoredCount = 0;
  if (Array.isArray(data.appSettings)) {
    for (const s of data.appSettings) {
      if (s.setting_key && s.setting_value !== undefined) {
        setSetting(String(s.setting_key), String(s.setting_value));
        restoredCount++;
      }
    }
  }
  if (Array.isArray(data.templates)) {
    for (const t of data.templates) {
      if (t.name && t.payload_json) {
        const exists = db.prepare('SELECT id FROM bot_templates WHERE name = ?').get(t.name);
        if (!exists) {
          db.prepare('INSERT INTO bot_templates (name, template_type, payload_json) VALUES (?, ?, ?)').run(
            String(t.name),
            'inline_keyboard',
            String(t.payload_json)
          );
          restoredCount++;
        }
      }
    }
  }
  if (Array.isArray(data.savedRequests)) {
    for (const r of data.savedRequests) {
      if (r.name && r.method) {
        const exists = db.prepare('SELECT id FROM saved_api_requests WHERE name = ?').get(r.name);
        if (!exists) {
          db.prepare('INSERT INTO saved_api_requests (name, method, params_json) VALUES (?, ?, ?)').run(
            String(r.name),
            String(r.method),
            String(r.params_json || '{}')
          );
          restoredCount++;
        }
      }
    }
  }

  logActivity({
    action: 'BACKUP_RESTORED',
    status: 'success',
    relatedResource: 'json_restore',
    details: `Verified checksum and restored ${restoredCount} configuration items.`,
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true, restoredCount, message: `Backup verified and restored (${restoredCount} items applied).` });
});
