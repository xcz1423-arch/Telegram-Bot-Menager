import { db, logActivity, pushNotification, setSetting } from './db.js';
import { encryptToken, generateRandomToken, hashTokenFingerprint, maskToken } from './crypto.js';

function daysAgoIso(daysAgo: number, hourOffset = 10): string {
  const d = new Date(Date.now() - daysAgo * 86400000);
  d.setUTCHours(hourOffset, 15, 0, 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function dateDaysAgo(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString().slice(0, 10);
}

export function seedDemoWorkspace(baseUrl = 'https://xc-console.local', ownerUserId: number | null = null): void {
  const existingBots = db.prepare('SELECT COUNT(*) as cnt FROM bots').get() as { cnt: number };
  if (existingBots.cnt > 0) return;

  let resolvedOwnerId = ownerUserId;
  if (resolvedOwnerId === null) {
    const ownerRow =
      (db.prepare(`SELECT id FROM admin_users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`).get() as { id: number } | undefined) ||
      (db.prepare(`SELECT id FROM admin_users ORDER BY id ASC LIMIT 1`).get() as { id: number } | undefined);
    resolvedOwnerId = ownerRow?.id ?? null;
  }

  setSetting('app_name', 'XC BOT CONTROL');
  setSetting('default_theme', 'dark');
  setSetting('timezone', 'UTC');
  setSetting('date_format', 'YYYY-MM-DD HH:mm');
  setSetting('notify_webhook_errors', 'true');
  setSetting('notify_failed_api', 'true');

  const demoBots = [
    {
      bot_key: 'xc_commerce_bot',
      telegram_bot_id: 7104829101,
      name: 'XC Commerce Relay',
      username: 'xc_commerce_bot',
      short_description: 'Order status, invoice delivery, and checkout callbacks.',
      description: 'Production customer notification and interactive order dispatch bot.',
      token: 'sandbox:xc_commerce_bot',
      connection_status: 'connected',
      webhook_status: 'active',
      webhook_url: `${baseUrl}/api/webhook/xc_commerce_bot`,
      webhook_secret: generateRandomToken(16),
      can_join_groups: 1,
      can_read_all_group_messages: 0,
      supports_inline_queries: 1,
    },
    {
      bot_key: 'xc_ops_alerts_bot',
      telegram_bot_id: 7104829204,
      name: 'XC Ops Telemetry',
      username: 'xc_ops_alerts_bot',
      short_description: 'Infrastructure alerts and deployment approval workflows.',
      description: 'Internal engineering alert dispatcher for release pipelines and cluster health.',
      token: 'sandbox:xc_ops_alerts_bot',
      connection_status: 'connected',
      webhook_status: 'active',
      webhook_url: `${baseUrl}/api/webhook/xc_ops_alerts_bot`,
      webhook_secret: generateRandomToken(16),
      can_join_groups: 1,
      can_read_all_group_messages: 1,
      supports_inline_queries: 0,
    },
    {
      bot_key: 'xc_support_desk_bot',
      telegram_bot_id: 7104829388,
      name: 'XC Support Desk',
      username: 'xc_support_desk_bot',
      short_description: 'Ticket routing and knowledge base quick replies.',
      description: 'Customer helpdesk routing bot (currently paused for maintenance).',
      token: 'sandbox:xc_support_desk_bot',
      connection_status: 'disconnected',
      webhook_status: 'inactive',
      webhook_url: null,
      webhook_secret: generateRandomToken(16),
      can_join_groups: 1,
      can_read_all_group_messages: 0,
      supports_inline_queries: 0,
    },
  ];

  const insertedBotIds: number[] = [];

  for (const b of demoBots) {
    const res = db
      .prepare(`
        INSERT INTO bots (
          owner_user_id, bot_key, telegram_bot_id, name, username, short_description, description,
          mode, encrypted_token, token_fingerprint, token_masked,
          connection_status, webhook_status, webhook_url, webhook_secret_encrypted,
          can_join_groups, can_read_all_group_messages, supports_inline_queries,
          last_checked_at, last_activity_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'sandbox', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `)
      .run(
        resolvedOwnerId,
        b.bot_key,
        b.telegram_bot_id,
        b.name,
        b.username,
        b.short_description,
        b.description,
        encryptToken(b.token),
        hashTokenFingerprint(b.token),
        maskToken(b.token),
        b.connection_status,
        b.webhook_status,
        b.webhook_url,
        encryptToken(b.webhook_secret),
        b.can_join_groups,
        b.can_read_all_group_messages,
        b.supports_inline_queries
      );

    const botId = Number(res.lastInsertRowid);
    insertedBotIds.push(botId);

    db.prepare(`
      INSERT INTO bot_settings (bot_id, default_parse_mode, disable_notification, protect_content)
      VALUES (?, 'HTML', 0, 0)
    `).run(botId);
  }

  const [commerceId, opsId, supportId] = insertedBotIds;

  // Known chats
  const chats = [
    [commerceId, '104829104', 'private', null, 'sara_lin', 'Sara', 'Lin', null, daysAgoIso(0, 14)],
    [commerceId, '-100192837465', 'supergroup', 'XC VIP Merchants', 'xc_merchants', null, null, 148, daysAgoIso(0, 12)],
    [commerceId, '@xc_releases_feed', 'channel', 'XC Release Announcements', 'xc_releases_feed', null, null, 1240, daysAgoIso(1, 9)],
    [opsId, '-100884120099', 'group', 'SRE Incident Bridge', null, null, null, 18, daysAgoIso(0, 13)],
    [opsId, '209481122', 'private', null, 'daniel_k', 'Daniel', 'Kim', null, daysAgoIso(1, 16)],
    [supportId, '308819204', 'private', null, 'nadia_r', 'Nadia', 'Rahman', null, daysAgoIso(2, 11)],
  ];

  for (const c of chats) {
    db.prepare(`
      INSERT INTO bot_chats (bot_id, chat_id, chat_type, title, username, first_name, last_name, member_count, last_interaction_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...c);
  }

  // Commands
  const commands = [
    [commerceId, 'start', 'Open the merchant order dashboard', 'default', '', 0],
    [commerceId, 'orders', 'Inspect recent order status and tracking', 'default', '', 1],
    [commerceId, 'support', 'Connect with priority billing desk', 'all_private_chats', '', 2],
    [opsId, 'health', 'Check cluster latency and worker status', 'default', '', 0],
    [opsId, 'deploy', 'Trigger release approval checklist', 'all_group_chats', '', 1],
    [supportId, 'ticket', 'Create a new developer support ticket', 'default', '', 0],
  ];

  for (const cmd of commands) {
    db.prepare(`
      INSERT INTO bot_commands (bot_id, command, description, scope_type, language_code, sort_order, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(...cmd);
  }

  // Keyboard Templates
  db.prepare(`
    INSERT INTO bot_templates (owner_user_id, bot_id, name, template_type, payload_json)
    VALUES (?, ?, ?, 'inline_keyboard', ?)
  `).run(
    resolvedOwnerId,
    commerceId,
    'Order Action Menu',
    JSON.stringify({
      inline_keyboard: [
        [
          { text: 'Track Shipment', callback_data: 'order_track' },
          { text: 'Download Invoice', callback_data: 'order_invoice' },
        ],
        [{ text: 'Open Merchant Portal', url: 'https://t.me' }],
      ],
    })
  );

  db.prepare(`
    INSERT INTO bot_templates (owner_user_id, bot_id, name, template_type, payload_json)
    VALUES (?, ?, ?, 'inline_keyboard', ?)
  `).run(
    resolvedOwnerId,
    opsId,
    'Release Approval Gate',
    JSON.stringify({
      inline_keyboard: [
        [
          { text: 'Approve Production', callback_data: 'deploy_approve' },
          { text: 'Hold Rollout', callback_data: 'deploy_hold' },
        ],
      ],
    })
  );

  // Incoming Updates
  const updates = [
    {
      botId: commerceId,
      updateId: 89412001,
      type: 'message',
      chatId: '104829104',
      username: 'sara_lin',
      summary: '/orders #XC-4921',
      status: 'processed',
      raw: {
        update_id: 89412001,
        message: {
          message_id: 412,
          from: { id: 104829104, is_bot: false, first_name: 'Sara', username: 'sara_lin' },
          chat: { id: 104829104, first_name: 'Sara', username: 'sara_lin', type: 'private' },
          date: Math.floor(Date.now() / 1000) - 1800,
          text: '/orders #XC-4921',
        },
      },
      at: daysAgoIso(0, 14),
    },
    {
      botId: commerceId,
      updateId: 89412002,
      type: 'callback_query',
      chatId: '-100192837465',
      username: 'sara_lin',
      summary: 'Callback: order_track',
      status: 'processed',
      raw: {
        update_id: 89412002,
        callback_query: {
          id: 'cbq_9948102',
          from: { id: 104829104, is_bot: false, first_name: 'Sara', username: 'sara_lin' },
          message: { message_id: 415, chat: { id: -100192837465, title: 'XC VIP Merchants', type: 'supergroup' } },
          data: 'order_track',
        },
      },
      at: daysAgoIso(0, 12),
    },
    {
      botId: opsId,
      updateId: 55100291,
      type: 'message',
      chatId: '-100884120099',
      username: 'daniel_k',
      summary: '/health eu-west-1',
      status: 'processed',
      raw: {
        update_id: 55100291,
        message: {
          message_id: 98,
          from: { id: 209481122, is_bot: false, first_name: 'Daniel', username: 'daniel_k' },
          chat: { id: -100884120099, title: 'SRE Incident Bridge', type: 'group' },
          date: Math.floor(Date.now() / 1000) - 3600,
          text: '/health eu-west-1',
        },
      },
      at: daysAgoIso(0, 13),
    },
  ];

  for (const u of updates) {
    db.prepare(`
      INSERT INTO bot_updates (bot_id, update_id, update_type, chat_id, sender_username, summary, processing_status, raw_json, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(u.botId, u.updateId, u.type, u.chatId, u.username, u.summary, u.status, JSON.stringify(u.raw), u.at);

    db.prepare(`
      INSERT INTO webhook_logs (bot_id, update_id, http_status, secret_verified, status, payload_preview, created_at)
      VALUES (?, ?, 200, 1, 'accepted', ?, ?)
    `).run(u.botId, u.updateId, u.summary, u.at);
  }

  // Sent Messages
  db.prepare(`
    INSERT INTO bot_messages (bot_id, telegram_message_id, chat_id, message_type, parse_mode, content_preview, reply_markup_json, delivery_status, api_response_json, sent_at)
    VALUES (?, 415, '104829104', 'text', 'HTML', ?, ?, 'sent', ?, ?)
  `).run(
    commerceId,
    '<b>Order #XC-4921</b> has been dispatched via DHL Express.',
    JSON.stringify({ inline_keyboard: [[{ text: 'Track Shipment', callback_data: 'order_track' }]] }),
    JSON.stringify({ ok: true, result: { message_id: 415, chat: { id: 104829104 } } }),
    daysAgoIso(0, 13)
  );

  db.prepare(`
    INSERT INTO bot_messages (bot_id, telegram_message_id, chat_id, message_type, parse_mode, content_preview, reply_markup_json, delivery_status, api_response_json, sent_at)
    VALUES (?, 99, '-100884120099', 'text', 'HTML', ?, null, 'sent', ?, ?)
  `).run(
    opsId,
    'Cluster <code>eu-west-1</code> nominal: p95 42ms, 0 dropped webhooks.',
    JSON.stringify({ ok: true, result: { message_id: 99, chat: { id: -100884120099 } } }),
    daysAgoIso(0, 12)
  );

  // API Logs
  const sampleApiLogs = [
    [commerceId, 'getMe', 200, null, 1, 84, '{}', '{"ok":true,"result":{"id":7104829101,"is_bot":true,"username":"xc_commerce_bot"}}', null, daysAgoIso(0, 14)],
    [commerceId, 'sendMessage', 200, null, 1, 112, '{"chat_id":"104829104","parse_mode":"HTML"}', '{"ok":true,"result":{"message_id":415}}', null, daysAgoIso(0, 13)],
    [opsId, 'getWebhookInfo', 200, null, 1, 69, '{}', '{"ok":true,"result":{"url":"https://xc-console.local/api/webhook/xc_ops_alerts_bot","pending_update_count":0}}', null, daysAgoIso(0, 12)],
    [supportId, 'sendMessage', 400, 400, 0, 95, '{"chat_id":"999000111"}', '{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}', 'Bad Request: chat not found', daysAgoIso(1, 15)],
  ];

  for (const log of sampleApiLogs) {
    db.prepare(`
      INSERT INTO api_logs (bot_id, method, http_status, telegram_error_code, ok, duration_ms, request_payload_json, response_payload_json, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...log);
  }

  // 14 days of analytics_daily
  const dailySeries = [
    [13, 18, 24, 48, 46, 2],
    [12, 22, 31, 56, 54, 2],
    [11, 15, 19, 38, 37, 1],
    [10, 29, 44, 72, 70, 2],
    [9, 34, 52, 85, 81, 4],
    [8, 25, 36, 63, 62, 1],
    [7, 41, 60, 96, 93, 3],
    [6, 37, 54, 88, 86, 2],
    [5, 45, 68, 108, 105, 3],
    [4, 38, 49, 91, 88, 3],
    [3, 52, 77, 124, 121, 3],
    [2, 48, 70, 114, 111, 3],
    [1, 61, 88, 142, 137, 5],
    [0, 28, 42, 68, 66, 2],
  ];

  for (const [dAgo, msgs, upd, reqs, okCnt, failCnt] of dailySeries) {
    const date = dateDaysAgo(dAgo);
    db.prepare(`
      INSERT INTO analytics_daily (metric_date, bot_id, messages_sent, updates_received, api_requests, api_success, api_failed, total_duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(date, commerceId, Math.round(msgs * 0.65), Math.round(upd * 0.7), Math.round(reqs * 0.6), Math.round(okCnt * 0.6), Math.max(0, failCnt - 1), reqs * 85);

    db.prepare(`
      INSERT INTO analytics_daily (metric_date, bot_id, messages_sent, updates_received, api_requests, api_success, api_failed, total_duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(date, opsId, Math.round(msgs * 0.35), Math.round(upd * 0.3), Math.round(reqs * 0.4), Math.round(okCnt * 0.4), failCnt > 1 ? 1 : 0, reqs * 42);
  }

  // Saved API Requests
  db.prepare(`
    INSERT INTO saved_api_requests (owner_user_id, bot_id, name, method, params_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    resolvedOwnerId,
    commerceId,
    'Dispatch Order Confirmation',
    'sendMessage',
    JSON.stringify({
      chat_id: '104829104',
      text: '<b>Order Confirmed</b>\nTracking code: <code>XC-88412</code>',
      parse_mode: 'HTML',
    })
  );

  db.prepare(`
    INSERT INTO saved_api_requests (owner_user_id, bot_id, name, method, params_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(resolvedOwnerId, opsId, 'Inspect Webhook Health', 'getWebhookInfo', '{}');

  // Notifications & Activity Logs
  pushNotification({
    botId: commerceId,
    targetUserId: resolvedOwnerId,
    severity: 'success',
    title: 'Webhook Verified',
    message: '@xc_commerce_bot webhook endpoint responded 200 OK with valid secret header.',
  });
  pushNotification({
    botId: supportId,
    targetUserId: resolvedOwnerId,
    severity: 'warning',
    title: 'Bot Disconnected',
    message: '@xc_support_desk_bot has an inactive webhook and failed a recent chat lookup.',
  });

  logActivity({
    ownerUserId: resolvedOwnerId,
    action: 'WORKSPACE_INITIALIZED',
    status: 'success',
    relatedResource: 'seed',
    details: 'Initialized XC BOT CONTROL sandbox bots and telemetry.',
  });
}
