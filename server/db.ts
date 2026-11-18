import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function isServerlessRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export function getStorageDir(): string {
  if (process.env.XC_STORAGE_DIR) {
    return path.resolve(process.env.XC_STORAGE_DIR);
  }
  if (isServerlessRuntime()) {
    return path.join(os.tmpdir(), 'xc_bot_control');
  }
  return path.resolve(process.cwd(), 'storage');
}

const STORAGE_DIR = getStorageDir();
const DB_PATH = path.join(STORAGE_DIR, 'xc_bot_control.sqlite');

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);

try {
  db.exec('PRAGMA journal_mode = WAL;');
} catch {
  // Fallback cleanly if filesystem does not support WAL
}
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  -- 1. admin_users
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    recovery_hint TEXT,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 2. bots
  CREATE TABLE IF NOT EXISTS bots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_key TEXT NOT NULL UNIQUE,
    telegram_bot_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    username TEXT NOT NULL,
    short_description TEXT DEFAULT '',
    description TEXT DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'live' CHECK(mode IN ('live', 'sandbox')),
    encrypted_token TEXT NOT NULL,
    token_fingerprint TEXT NOT NULL UNIQUE,
    token_masked TEXT NOT NULL,
    connection_status TEXT NOT NULL DEFAULT 'connected' CHECK(connection_status IN ('connected', 'disconnected', 'invalid_token', 'webhook_error', 'api_error')),
    webhook_status TEXT NOT NULL DEFAULT 'inactive' CHECK(webhook_status IN ('active', 'inactive', 'error')),
    webhook_url TEXT,
    webhook_secret_encrypted TEXT,
    pending_update_count INTEGER NOT NULL DEFAULT 0,
    last_webhook_error TEXT,
    can_join_groups INTEGER NOT NULL DEFAULT 1,
    can_read_all_group_messages INTEGER NOT NULL DEFAULT 0,
    supports_inline_queries INTEGER NOT NULL DEFAULT 0,
    last_checked_at TEXT,
    last_activity_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 3. bot_settings
  CREATE TABLE IF NOT EXISTS bot_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id INTEGER NOT NULL UNIQUE,
    default_parse_mode TEXT NOT NULL DEFAULT 'HTML',
    disable_notification INTEGER NOT NULL DEFAULT 0,
    protect_content INTEGER NOT NULL DEFAULT 0,
    auto_store_updates INTEGER NOT NULL DEFAULT 1,
    allowed_updates_json TEXT NOT NULL DEFAULT '["message","edited_message","callback_query","channel_post","my_chat_member"]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
  );

  -- 4. bot_chats
  CREATE TABLE IF NOT EXISTS bot_chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id INTEGER NOT NULL,
    chat_id TEXT NOT NULL,
    chat_type TEXT NOT NULL DEFAULT 'private' CHECK(chat_type IN ('private', 'group', 'supergroup', 'channel')),
    title TEXT,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    member_count INTEGER,
    last_interaction_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(bot_id, chat_id),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
  );

  -- 5. bot_updates (unique constraint prevents duplicate processing)
  CREATE TABLE IF NOT EXISTS bot_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id INTEGER NOT NULL,
    update_id INTEGER NOT NULL,
    update_type TEXT NOT NULL,
    chat_id TEXT,
    sender_username TEXT,
    summary TEXT,
    processing_status TEXT NOT NULL DEFAULT 'processed' CHECK(processing_status IN ('processed', 'duplicate', 'failed')),
    error_message TEXT,
    raw_json TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(bot_id, update_id),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
  );

  -- 6. bot_messages
  CREATE TABLE IF NOT EXISTS bot_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id INTEGER NOT NULL,
    telegram_message_id INTEGER,
    chat_id TEXT NOT NULL,
    message_type TEXT NOT NULL,
    parse_mode TEXT,
    content_preview TEXT,
    reply_markup_json TEXT,
    delivery_status TEXT NOT NULL CHECK(delivery_status IN ('sent', 'failed')),
    api_response_json TEXT NOT NULL,
    error_message TEXT,
    sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
  );

  -- 7. bot_commands
  CREATE TABLE IF NOT EXISTS bot_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id INTEGER NOT NULL,
    command TEXT NOT NULL,
    description TEXT NOT NULL,
    scope_type TEXT NOT NULL DEFAULT 'default',
    language_code TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    synced_at TEXT,
    UNIQUE(bot_id, command, scope_type, language_code),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
  );

  -- 8. bot_templates
  CREATE TABLE IF NOT EXISTS bot_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id INTEGER,
    name TEXT NOT NULL,
    template_type TEXT NOT NULL DEFAULT 'inline_keyboard',
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE SET NULL
  );

  -- 9. api_logs
  CREATE TABLE IF NOT EXISTS api_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id INTEGER,
    method TEXT NOT NULL,
    http_status INTEGER NOT NULL,
    telegram_error_code INTEGER,
    ok INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    request_payload_json TEXT,
    response_payload_json TEXT NOT NULL,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE SET NULL
  );

  -- 10. webhook_logs
  CREATE TABLE IF NOT EXISTS webhook_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id INTEGER,
    update_id INTEGER,
    http_status INTEGER NOT NULL,
    secret_verified INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK(status IN ('accepted', 'duplicate', 'rejected', 'error')),
    error_message TEXT,
    payload_preview TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE SET NULL
  );

  -- 11. activity_logs
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    bot_id INTEGER,
    bot_name TEXT,
    status TEXT NOT NULL DEFAULT 'success' CHECK(status IN ('success', 'warning', 'failed')),
    related_resource TEXT,
    details TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 12. analytics_daily
  CREATE TABLE IF NOT EXISTS analytics_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_date TEXT NOT NULL,
    bot_id INTEGER NOT NULL,
    messages_sent INTEGER NOT NULL DEFAULT 0,
    updates_received INTEGER NOT NULL DEFAULT 0,
    api_requests INTEGER NOT NULL DEFAULT 0,
    api_success INTEGER NOT NULL DEFAULT 0,
    api_failed INTEGER NOT NULL DEFAULT 0,
    total_duration_ms INTEGER NOT NULL DEFAULT 0,
    UNIQUE(metric_date, bot_id),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
  );

  -- 13. admin_sessions
  CREATE TABLE IF NOT EXISTS admin_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token_hash TEXT NOT NULL UNIQUE,
    csrf_token TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    user_agent TEXT,
    ip_address TEXT,
    remember_me INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
  );

  -- 14. saved_api_requests
  CREATE TABLE IF NOT EXISTS saved_api_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id INTEGER,
    name TEXT NOT NULL,
    method TEXT NOT NULL,
    params_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE SET NULL
  );

  -- 15. notifications
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id INTEGER,
    severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info', 'success', 'warning', 'error')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Global app settings & login attempt tracking
  CREATE TABLE IF NOT EXISTS app_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    success INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_bot_updates_bot_time ON bot_updates(bot_id, received_at DESC);
  CREATE INDEX IF NOT EXISTS idx_bot_messages_bot_time ON bot_messages(bot_id, sent_at DESC);
  CREATE INDEX IF NOT EXISTS idx_api_logs_bot_time ON api_logs(bot_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_webhook_logs_bot_time ON webhook_logs(bot_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_activity_logs_time ON activity_logs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON analytics_daily(metric_date);
`);

export function getDbPath(): string {
  return DB_PATH;
}

export function getSetting(key: string, fallback: string): string {
  const row = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get(key) as
    | { setting_value: string }
    | undefined;
  return row ? row.setting_value : fallback;
}

export function setSetting(key: string, value: string): void {
  db.prepare(`
    INSERT INTO app_settings (setting_key, setting_value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = datetime('now')
  `).run(key, value);
}

export function logActivity(params: {
  action: string;
  botId?: number | null;
  botName?: string | null;
  status?: 'success' | 'warning' | 'failed';
  relatedResource?: string | null;
  details?: string | null;
  ipAddress?: string | null;
}): void {
  db.prepare(`
    INSERT INTO activity_logs (action, bot_id, bot_name, status, related_resource, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.action,
    params.botId ?? null,
    params.botName ?? null,
    params.status ?? 'success',
    params.relatedResource ?? null,
    params.details ?? null,
    params.ipAddress ?? null
  );
}

export function pushNotification(params: {
  botId?: number | null;
  severity?: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
}): void {
  db.prepare(`
    INSERT INTO notifications (bot_id, severity, title, message)
    VALUES (?, ?, ?, ?)
  `).run(params.botId ?? null, params.severity ?? 'info', params.title, params.message);
}

export function incrementDailyAnalytics(params: {
  botId: number;
  date?: string;
  messagesSent?: number;
  updatesReceived?: number;
  apiRequests?: number;
  apiSuccess?: number;
  apiFailed?: number;
  durationMs?: number;
}): void {
  const metricDate = params.date || new Date().toISOString().slice(0, 10);
  db.prepare(`
    INSERT INTO analytics_daily (
      metric_date, bot_id, messages_sent, updates_received, api_requests, api_success, api_failed, total_duration_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(metric_date, bot_id) DO UPDATE SET
      messages_sent = messages_sent + excluded.messages_sent,
      updates_received = updates_received + excluded.updates_received,
      api_requests = api_requests + excluded.api_requests,
      api_success = api_success + excluded.api_success,
      api_failed = api_failed + excluded.api_failed,
      total_duration_ms = total_duration_ms + excluded.total_duration_ms
  `).run(
    metricDate,
    params.botId,
    params.messagesSent ?? 0,
    params.updatesReceived ?? 0,
    params.apiRequests ?? 0,
    params.apiSuccess ?? 0,
    params.apiFailed ?? 0,
    params.durationMs ?? 0
  );
}
