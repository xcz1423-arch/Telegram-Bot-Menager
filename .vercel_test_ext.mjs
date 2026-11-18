// api/index.ts
import "dotenv/config";

// server/app.ts
import express2 from "express";

// server/db.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import initSqlJs from "sql.js/dist/sql-wasm-inline.js";
function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}
function getStorageDir() {
  if (process.env.XC_STORAGE_DIR) {
    return path.resolve(process.env.XC_STORAGE_DIR);
  }
  if (isServerlessRuntime()) {
    return path.join(os.tmpdir(), "xc_bot_control");
  }
  return path.resolve(process.cwd(), "storage");
}
var STORAGE_DIR = getStorageDir();
var DB_PATH = path.join(STORAGE_DIR, "xc_bot_control.sqlite");
var SCHEMA_SQL = `
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
`;
var activeDriver = null;
var initPromise = null;
function ensureDirWritable(dir) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  } catch {
    const tmp = path.join(os.tmpdir(), "xc_bot_control");
    if (!fs.existsSync(tmp)) {
      fs.mkdirSync(tmp, { recursive: true });
    }
    return tmp;
  }
}
function normalizeSqlParams(params) {
  return params.map((p) => {
    if (p === void 0 || p === null) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    if (typeof p === "number" || typeof p === "string" || p instanceof Uint8Array) return p;
    return String(p);
  });
}
async function createSqlJsDriver(dbFilePath) {
  const initFn = initSqlJs;
  const SQL = await initFn();
  let initialData;
  try {
    if (fs.existsSync(dbFilePath)) {
      initialData = fs.readFileSync(dbFilePath);
    }
  } catch {
    initialData = void 0;
  }
  const sqlDb = new SQL.Database(initialData);
  const persist = () => {
    try {
      fs.writeFileSync(dbFilePath, Buffer.from(sqlDb.export()));
    } catch {
    }
  };
  return {
    engineName: "SQLite (Embedded WASM)",
    exec(sql) {
      sqlDb.exec(sql);
      if (/^\s*(CREATE|INSERT|UPDATE|DELETE|DROP|ALTER)/im.test(sql)) {
        persist();
      }
    },
    prepare(sql) {
      const isWrite = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)/i.test(sql);
      return {
        run(...params) {
          const stmt = sqlDb.prepare(sql);
          try {
            stmt.bind(normalizeSqlParams(params));
            stmt.step();
          } finally {
            stmt.free();
          }
          let lastId = 0;
          const idRes = sqlDb.exec("SELECT last_insert_rowid()");
          if (idRes.length > 0 && idRes[0].values.length > 0) {
            lastId = Number(idRes[0].values[0][0] ?? 0);
          }
          const changes = sqlDb.getRowsModified();
          if (isWrite) {
            persist();
          }
          return { lastInsertRowid: lastId, changes };
        },
        get(...params) {
          const stmt = sqlDb.prepare(sql);
          try {
            stmt.bind(normalizeSqlParams(params));
            if (!stmt.step()) return void 0;
            return stmt.getAsObject();
          } finally {
            stmt.free();
          }
        },
        all(...params) {
          const stmt = sqlDb.prepare(sql);
          const rows = [];
          try {
            stmt.bind(normalizeSqlParams(params));
            while (stmt.step()) {
              rows.push(stmt.getAsObject());
            }
          } finally {
            stmt.free();
          }
          return rows;
        }
      };
    }
  };
}
async function createNodeSqliteDriver(dbFilePath) {
  const builtinModule = "node:sqlite";
  const { DatabaseSync } = await import(
    /* @vite-ignore */
    builtinModule
  );
  const nativeDb = new DatabaseSync(dbFilePath);
  try {
    nativeDb.exec("PRAGMA journal_mode = WAL;");
  } catch {
  }
  return {
    engineName: "SQLite (WAL Mode)",
    exec(sql) {
      nativeDb.exec(sql);
    },
    prepare(sql) {
      const stmt = nativeDb.prepare(sql);
      return {
        run(...params) {
          return stmt.run(...normalizeSqlParams(params));
        },
        get(...params) {
          return stmt.get(...normalizeSqlParams(params));
        },
        all(...params) {
          return stmt.all(...normalizeSqlParams(params));
        }
      };
    }
  };
}
async function ensureDbReady() {
  if (activeDriver) return;
  if (!initPromise) {
    initPromise = (async () => {
      const resolvedDir = ensureDirWritable(STORAGE_DIR);
      const dbFilePath = path.join(resolvedDir, "xc_bot_control.sqlite");
      if (process.env.XC_FORCE_SQLJS === "1" || isServerlessRuntime()) {
        activeDriver = await createSqlJsDriver(dbFilePath);
      } else {
        try {
          activeDriver = await createNodeSqliteDriver(dbFilePath);
        } catch {
          activeDriver = await createSqlJsDriver(dbFilePath);
        }
      }
      activeDriver.exec("PRAGMA foreign_keys = ON;");
      activeDriver.exec(SCHEMA_SQL);
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
}
function getActiveDriver() {
  if (!activeDriver) {
    throw new Error("Database not initialized. Call await ensureDbReady() first.");
  }
  return activeDriver;
}
var db = {
  get engineName() {
    return activeDriver?.engineName || "SQLite";
  },
  exec(sql) {
    getActiveDriver().exec(sql);
  },
  prepare(sql) {
    return getActiveDriver().prepare(sql);
  }
};
function getDbEngineName() {
  return activeDriver?.engineName || "SQLite";
}
function getDbPath() {
  return DB_PATH;
}
function getSetting(key, fallback) {
  const row = db.prepare("SELECT setting_value FROM app_settings WHERE setting_key = ?").get(key);
  return row ? row.setting_value : fallback;
}
function setSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (setting_key, setting_value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = datetime('now')
  `).run(key, value);
}
function logActivity(params) {
  db.prepare(`
    INSERT INTO activity_logs (action, bot_id, bot_name, status, related_resource, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.action,
    params.botId ?? null,
    params.botName ?? null,
    params.status ?? "success",
    params.relatedResource ?? null,
    params.details ?? null,
    params.ipAddress ?? null
  );
}
function pushNotification(params) {
  db.prepare(`
    INSERT INTO notifications (bot_id, severity, title, message)
    VALUES (?, ?, ?, ?)
  `).run(params.botId ?? null, params.severity ?? "info", params.title, params.message);
}
function incrementDailyAnalytics(params) {
  const metricDate = params.date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
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

// server/crypto.ts
import crypto from "node:crypto";
import fs2 from "node:fs";
import os2 from "node:os";
import path2 from "node:path";
function resolveKeyStorageDir() {
  if (process.env.XC_STORAGE_DIR) {
    return path2.resolve(process.env.XC_STORAGE_DIR);
  }
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path2.join(os2.tmpdir(), "xc_bot_control");
  }
  return path2.resolve(process.cwd(), "storage");
}
var cachedKey = null;
function hasExplicitMasterKey() {
  const envKey = process.env.XC_MASTER_KEY;
  return Boolean(envKey && envKey !== "CHANGE_ME_TO_A_STRONG_64_HEX_MASTER_KEY");
}
function getMasterKey() {
  if (cachedKey) return cachedKey;
  const envKey = process.env.XC_MASTER_KEY;
  if (envKey && envKey !== "CHANGE_ME_TO_A_STRONG_64_HEX_MASTER_KEY") {
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
      cachedKey = Buffer.from(envKey, "hex");
      return cachedKey;
    }
    cachedKey = crypto.createHash("sha256").update(envKey).digest();
    return cachedKey;
  }
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const seedMaterial = [
      process.env.XC_SESSION_SECRET,
      process.env.XC_ADMIN_PASSWORD,
      process.env.XC_RECOVERY_CODE,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
      process.env.VERCEL_URL,
      "xc-bot-control-serverless-fallback"
    ].filter(Boolean).join(":");
    cachedKey = crypto.createHash("sha256").update(seedMaterial).digest();
    return cachedKey;
  }
  const storageDir = resolveKeyStorageDir();
  const keyFile = path2.join(storageDir, ".master.key");
  if (!fs2.existsSync(storageDir)) {
    fs2.mkdirSync(storageDir, { recursive: true });
  }
  if (fs2.existsSync(keyFile)) {
    const hex = fs2.readFileSync(keyFile, "utf8").trim();
    if (/^[0-9a-fA-F]{64}$/.test(hex)) {
      cachedKey = Buffer.from(hex, "hex");
      return cachedKey;
    }
  }
  const generated = crypto.randomBytes(32);
  fs2.writeFileSync(keyFile, generated.toString("hex"), { mode: 384 });
  cachedKey = generated;
  return cachedKey;
}
function encryptToken(plaintext, keyOverride) {
  const key = keyOverride || getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}
function decryptToken(payload, keyOverride) {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Malformed encrypted token payload");
  }
  const [, ivHex, tagHex, dataHex] = parts;
  const key = keyOverride || getMasterKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}
function maskToken(token) {
  const trimmed = token.trim();
  if (trimmed.startsWith("sandbox:")) {
    return `${trimmed.slice(0, 14)}\u2022\u2022\u2022\u2022`;
  }
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx > 0) {
    const botId = trimmed.slice(0, colonIdx);
    const tail = trimmed.slice(-4);
    return `${botId}:\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${tail}`;
  }
  if (trimmed.length <= 8) return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  return `${trimmed.slice(0, 4)}\u2022\u2022\u2022\u2022${trimmed.slice(-4)}`;
}
function hashTokenFingerprint(token) {
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt:${salt}:${derived}`;
}
function verifyPassword(password, storedHash) {
  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hexHash] = parts;
  const expected = Buffer.from(hexHash, "hex");
  const actual = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
function generateRandomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("hex");
}
function computeBackupChecksum(data) {
  const serialized = JSON.stringify(data);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

// server/serverless.ts
import crypto2 from "node:crypto";

// src/lib/telegramSpec.ts
function validateBotTokenFormat(token, allowSandbox = true) {
  const trimmed = token.trim();
  if (!trimmed) {
    return { valid: false, mode: null, error: "Bot token is required." };
  }
  if (allowSandbox && /^sandbox:[a-zA-Z0-9_-]{3,40}$/.test(trimmed)) {
    return { valid: true, mode: "sandbox" };
  }
  if (/^\d{6,15}:[A-Za-z0-9_-]{25,64}$/.test(trimmed)) {
    return { valid: true, mode: "live" };
  }
  return {
    valid: false,
    mode: null,
    error: "Invalid token format. Expected Telegram BotFather token (e.g., 123456789:AAH...) or sandbox:<name>."
  };
}
function validateCommandName(command) {
  const normalized = command.trim().replace(/^\//, "");
  if (!normalized) {
    return { valid: false, normalized, error: "Command name is required." };
  }
  if (normalized.length > 32) {
    return { valid: false, normalized, error: "Command name must be at most 32 characters." };
  }
  if (!/^[a-z0-9_]+$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: "Command name can only contain lowercase letters, digits, and underscores."
    };
  }
  return { valid: true, normalized };
}
function validateCommandDescription(description) {
  const trimmed = description.trim();
  if (trimmed.length < 3 || trimmed.length > 256) {
    return { valid: false, error: "Description must be between 3 and 256 characters." };
  }
  return { valid: true };
}
function validateWebhookUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) {
    return { valid: false, error: "Webhook URL is required." };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      return { valid: false, error: "Telegram requires an HTTPS webhook URL." };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format." };
  }
}
function redactSecrets(input) {
  return input.replace(/\b\d{6,15}:[A-Za-z0-9_-]{20,64}\b/g, "[REDACTED_BOT_TOKEN]").replace(/(bot)\d{6,15}:[A-Za-z0-9_-]{20,64}/gi, "$1[REDACTED_BOT_TOKEN]").replace(/("?(?:secret_token|password|password_hash|token|api_key|authorization)"?\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"');
}

// server/serverless.ts
function signStatelessSession(payload, key) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto2.createHmac("sha256", key).update(encoded).digest("base64url");
  return `v1.${encoded}.${sig}`;
}
function verifyStatelessSession(token, key, nowMs = Date.now()) {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [, encoded, sig] = parts;
  if (!encoded || !sig) return null;
  const expectedSig = crypto2.createHmac("sha256", key).update(encoded).digest();
  let actualSig;
  try {
    actualSig = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (expectedSig.length !== actualSig.length) return null;
  if (!crypto2.timingSafeEqual(expectedSig, actualSig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof parsed.uid !== "number" || typeof parsed.u !== "string" || typeof parsed.dn !== "string" || typeof parsed.csrf !== "string" || typeof parsed.exp !== "number" || parsed.exp <= nowMs) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
function parseEnvBotTokens(env) {
  const entries = [];
  const seen = /* @__PURE__ */ new Set();
  const pushEntry = (rawToken, name, webhookSecret) => {
    const token = rawToken.trim();
    if (!token || seen.has(token)) return;
    if (!validateBotTokenFormat(token).valid) return;
    seen.add(token);
    entries.push({ token, name: name?.trim() || void 0, webhookSecret: webhookSecret?.trim() || void 0 });
  };
  if (env.TELEGRAM_BOT_TOKEN) {
    pushEntry(env.TELEGRAM_BOT_TOKEN);
  }
  const rawMulti = env.XC_BOT_TOKENS?.trim();
  if (rawMulti) {
    if (rawMulti.startsWith("[")) {
      try {
        const parsed = JSON.parse(rawMulti);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === "string") {
              pushEntry(item);
            } else if (item && typeof item === "object") {
              const obj = item;
              if (typeof obj.token === "string") {
                pushEntry(
                  obj.token,
                  typeof obj.name === "string" ? obj.name : void 0,
                  typeof obj.webhookSecret === "string" ? obj.webhookSecret : void 0
                );
              }
            }
          }
          return entries;
        }
      } catch {
      }
    }
    for (const part of rawMulti.split(/[\n,]+/)) {
      pushEntry(part);
    }
  }
  return entries;
}
function getSuggestedWebhookBaseUrl(params) {
  const normalize = (raw) => {
    const trimmed = raw.trim().replace(/\/$/, "");
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    return `https://${trimmed}`;
  };
  if (params.appUrl && params.appUrl !== "MY_APP_URL" && !params.appUrl.includes("your-domain.example.com")) {
    return normalize(params.appUrl);
  }
  if (params.vercelProdUrl) {
    return normalize(params.vercelProdUrl);
  }
  if (params.vercelUrl) {
    return normalize(params.vercelUrl);
  }
  const host = params.host || "localhost:3000";
  const proto = params.proto === "http" && host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

// server/seed.ts
function daysAgoIso(daysAgo, hourOffset = 10) {
  const d = new Date(Date.now() - daysAgo * 864e5);
  d.setUTCHours(hourOffset, 15, 0, 0);
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function dateDaysAgo(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 864e5);
  return d.toISOString().slice(0, 10);
}
function seedDemoWorkspace(baseUrl = "https://xc-console.local") {
  const existingBots = db.prepare("SELECT COUNT(*) as cnt FROM bots").get();
  if (existingBots.cnt > 0) return;
  setSetting("app_name", "XC BOT CONTROL");
  setSetting("default_theme", "dark");
  setSetting("timezone", "UTC");
  setSetting("date_format", "YYYY-MM-DD HH:mm");
  setSetting("notify_webhook_errors", "true");
  setSetting("notify_failed_api", "true");
  const demoBots = [
    {
      bot_key: "xc_commerce_bot",
      telegram_bot_id: 7104829101,
      name: "XC Commerce Relay",
      username: "xc_commerce_bot",
      short_description: "Order status, invoice delivery, and checkout callbacks.",
      description: "Production customer notification and interactive order dispatch bot.",
      token: "sandbox:xc_commerce_bot",
      connection_status: "connected",
      webhook_status: "active",
      webhook_url: `${baseUrl}/api/webhook/xc_commerce_bot`,
      webhook_secret: generateRandomToken(16),
      can_join_groups: 1,
      can_read_all_group_messages: 0,
      supports_inline_queries: 1
    },
    {
      bot_key: "xc_ops_alerts_bot",
      telegram_bot_id: 7104829204,
      name: "XC Ops Telemetry",
      username: "xc_ops_alerts_bot",
      short_description: "Infrastructure alerts and deployment approval workflows.",
      description: "Internal engineering alert dispatcher for release pipelines and cluster health.",
      token: "sandbox:xc_ops_alerts_bot",
      connection_status: "connected",
      webhook_status: "active",
      webhook_url: `${baseUrl}/api/webhook/xc_ops_alerts_bot`,
      webhook_secret: generateRandomToken(16),
      can_join_groups: 1,
      can_read_all_group_messages: 1,
      supports_inline_queries: 0
    },
    {
      bot_key: "xc_support_desk_bot",
      telegram_bot_id: 7104829388,
      name: "XC Support Desk",
      username: "xc_support_desk_bot",
      short_description: "Ticket routing and knowledge base quick replies.",
      description: "Customer helpdesk routing bot (currently paused for maintenance).",
      token: "sandbox:xc_support_desk_bot",
      connection_status: "disconnected",
      webhook_status: "inactive",
      webhook_url: null,
      webhook_secret: generateRandomToken(16),
      can_join_groups: 1,
      can_read_all_group_messages: 0,
      supports_inline_queries: 0
    }
  ];
  const insertedBotIds = [];
  for (const b of demoBots) {
    const res = db.prepare(`
        INSERT INTO bots (
          bot_key, telegram_bot_id, name, username, short_description, description,
          mode, encrypted_token, token_fingerprint, token_masked,
          connection_status, webhook_status, webhook_url, webhook_secret_encrypted,
          can_join_groups, can_read_all_group_messages, supports_inline_queries,
          last_checked_at, last_activity_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'sandbox', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
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
  const chats = [
    [commerceId, "104829104", "private", null, "sara_lin", "Sara", "Lin", null, daysAgoIso(0, 14)],
    [commerceId, "-100192837465", "supergroup", "XC VIP Merchants", "xc_merchants", null, null, 148, daysAgoIso(0, 12)],
    [commerceId, "@xc_releases_feed", "channel", "XC Release Announcements", "xc_releases_feed", null, null, 1240, daysAgoIso(1, 9)],
    [opsId, "-100884120099", "group", "SRE Incident Bridge", null, null, null, 18, daysAgoIso(0, 13)],
    [opsId, "209481122", "private", null, "daniel_k", "Daniel", "Kim", null, daysAgoIso(1, 16)],
    [supportId, "308819204", "private", null, "nadia_r", "Nadia", "Rahman", null, daysAgoIso(2, 11)]
  ];
  for (const c of chats) {
    db.prepare(`
      INSERT INTO bot_chats (bot_id, chat_id, chat_type, title, username, first_name, last_name, member_count, last_interaction_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...c);
  }
  const commands = [
    [commerceId, "start", "Open the merchant order dashboard", "default", "", 0],
    [commerceId, "orders", "Inspect recent order status and tracking", "default", "", 1],
    [commerceId, "support", "Connect with priority billing desk", "all_private_chats", "", 2],
    [opsId, "health", "Check cluster latency and worker status", "default", "", 0],
    [opsId, "deploy", "Trigger release approval checklist", "all_group_chats", "", 1],
    [supportId, "ticket", "Create a new developer support ticket", "default", "", 0]
  ];
  for (const cmd of commands) {
    db.prepare(`
      INSERT INTO bot_commands (bot_id, command, description, scope_type, language_code, sort_order, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(...cmd);
  }
  db.prepare(`
    INSERT INTO bot_templates (bot_id, name, template_type, payload_json)
    VALUES (?, ?, 'inline_keyboard', ?)
  `).run(
    commerceId,
    "Order Action Menu",
    JSON.stringify({
      inline_keyboard: [
        [
          { text: "Track Shipment", callback_data: "order_track" },
          { text: "Download Invoice", callback_data: "order_invoice" }
        ],
        [{ text: "Open Merchant Portal", url: "https://t.me" }]
      ]
    })
  );
  db.prepare(`
    INSERT INTO bot_templates (bot_id, name, template_type, payload_json)
    VALUES (?, ?, 'inline_keyboard', ?)
  `).run(
    opsId,
    "Release Approval Gate",
    JSON.stringify({
      inline_keyboard: [
        [
          { text: "Approve Production", callback_data: "deploy_approve" },
          { text: "Hold Rollout", callback_data: "deploy_hold" }
        ]
      ]
    })
  );
  const updates = [
    {
      botId: commerceId,
      updateId: 89412001,
      type: "message",
      chatId: "104829104",
      username: "sara_lin",
      summary: "/orders #XC-4921",
      status: "processed",
      raw: {
        update_id: 89412001,
        message: {
          message_id: 412,
          from: { id: 104829104, is_bot: false, first_name: "Sara", username: "sara_lin" },
          chat: { id: 104829104, first_name: "Sara", username: "sara_lin", type: "private" },
          date: Math.floor(Date.now() / 1e3) - 1800,
          text: "/orders #XC-4921"
        }
      },
      at: daysAgoIso(0, 14)
    },
    {
      botId: commerceId,
      updateId: 89412002,
      type: "callback_query",
      chatId: "-100192837465",
      username: "sara_lin",
      summary: "Callback: order_track",
      status: "processed",
      raw: {
        update_id: 89412002,
        callback_query: {
          id: "cbq_9948102",
          from: { id: 104829104, is_bot: false, first_name: "Sara", username: "sara_lin" },
          message: { message_id: 415, chat: { id: -100192837465, title: "XC VIP Merchants", type: "supergroup" } },
          data: "order_track"
        }
      },
      at: daysAgoIso(0, 12)
    },
    {
      botId: opsId,
      updateId: 55100291,
      type: "message",
      chatId: "-100884120099",
      username: "daniel_k",
      summary: "/health eu-west-1",
      status: "processed",
      raw: {
        update_id: 55100291,
        message: {
          message_id: 98,
          from: { id: 209481122, is_bot: false, first_name: "Daniel", username: "daniel_k" },
          chat: { id: -100884120099, title: "SRE Incident Bridge", type: "group" },
          date: Math.floor(Date.now() / 1e3) - 3600,
          text: "/health eu-west-1"
        }
      },
      at: daysAgoIso(0, 13)
    }
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
  db.prepare(`
    INSERT INTO bot_messages (bot_id, telegram_message_id, chat_id, message_type, parse_mode, content_preview, reply_markup_json, delivery_status, api_response_json, sent_at)
    VALUES (?, 415, '104829104', 'text', 'HTML', ?, ?, 'sent', ?, ?)
  `).run(
    commerceId,
    "<b>Order #XC-4921</b> has been dispatched via DHL Express.",
    JSON.stringify({ inline_keyboard: [[{ text: "Track Shipment", callback_data: "order_track" }]] }),
    JSON.stringify({ ok: true, result: { message_id: 415, chat: { id: 104829104 } } }),
    daysAgoIso(0, 13)
  );
  db.prepare(`
    INSERT INTO bot_messages (bot_id, telegram_message_id, chat_id, message_type, parse_mode, content_preview, reply_markup_json, delivery_status, api_response_json, sent_at)
    VALUES (?, 99, '-100884120099', 'text', 'HTML', ?, null, 'sent', ?, ?)
  `).run(
    opsId,
    "Cluster <code>eu-west-1</code> nominal: p95 42ms, 0 dropped webhooks.",
    JSON.stringify({ ok: true, result: { message_id: 99, chat: { id: -100884120099 } } }),
    daysAgoIso(0, 12)
  );
  const sampleApiLogs = [
    [commerceId, "getMe", 200, null, 1, 84, "{}", '{"ok":true,"result":{"id":7104829101,"is_bot":true,"username":"xc_commerce_bot"}}', null, daysAgoIso(0, 14)],
    [commerceId, "sendMessage", 200, null, 1, 112, '{"chat_id":"104829104","parse_mode":"HTML"}', '{"ok":true,"result":{"message_id":415}}', null, daysAgoIso(0, 13)],
    [opsId, "getWebhookInfo", 200, null, 1, 69, "{}", '{"ok":true,"result":{"url":"https://xc-console.local/api/webhook/xc_ops_alerts_bot","pending_update_count":0}}', null, daysAgoIso(0, 12)],
    [supportId, "sendMessage", 400, 400, 0, 95, '{"chat_id":"999000111"}', '{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}', "Bad Request: chat not found", daysAgoIso(1, 15)]
  ];
  for (const log of sampleApiLogs) {
    db.prepare(`
      INSERT INTO api_logs (bot_id, method, http_status, telegram_error_code, ok, duration_ms, request_payload_json, response_payload_json, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...log);
  }
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
    [0, 28, 42, 68, 66, 2]
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
  db.prepare(`
    INSERT INTO saved_api_requests (bot_id, name, method, params_json)
    VALUES (?, ?, ?, ?)
  `).run(
    commerceId,
    "Dispatch Order Confirmation",
    "sendMessage",
    JSON.stringify({
      chat_id: "104829104",
      text: "<b>Order Confirmed</b>\nTracking code: <code>XC-88412</code>",
      parse_mode: "HTML"
    })
  );
  db.prepare(`
    INSERT INTO saved_api_requests (bot_id, name, method, params_json)
    VALUES (?, ?, ?, ?)
  `).run(opsId, "Inspect Webhook Health", "getWebhookInfo", "{}");
  pushNotification({
    botId: commerceId,
    severity: "success",
    title: "Webhook Verified",
    message: "@xc_commerce_bot webhook endpoint responded 200 OK with valid secret header."
  });
  pushNotification({
    botId: supportId,
    severity: "warning",
    title: "Bot Disconnected",
    message: "@xc_support_desk_bot has an inactive webhook and failed a recent chat lookup."
  });
  logActivity({
    action: "WORKSPACE_INITIALIZED",
    status: "success",
    relatedResource: "seed",
    details: "Initialized XC BOT CONTROL sandbox bots and telemetry."
  });
}

// server/bootstrap.ts
var bootstrapped = false;
function ensureServerlessBootstrap(force = false) {
  if (bootstrapped && !force) return;
  bootstrapped = true;
  const baseUrl = getSuggestedWebhookBaseUrl({
    appUrl: process.env.APP_URL,
    vercelProdUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    vercelUrl: process.env.VERCEL_URL
  });
  const envUsername = (process.env.XC_ADMIN_USERNAME || "admin").trim();
  const envDisplayName = (process.env.XC_ADMIN_DISPLAY_NAME || "Lead Developer").trim();
  const envPassword = process.env.XC_ADMIN_PASSWORD || "";
  const adminCount = db.prepare("SELECT COUNT(*) as cnt FROM admin_users").get().cnt;
  if (adminCount === 0 && envPassword.length >= 8) {
    db.prepare(`
      INSERT INTO admin_users (username, display_name, password_hash, recovery_hint)
      VALUES (?, ?, ?, 'Configured via environment variable')
    `).run(envUsername, envDisplayName || envUsername, hashPassword(envPassword));
    logActivity({
      action: "ENV_ADMIN_BOOTSTRAP",
      status: "success",
      relatedResource: envUsername,
      details: "Initialized administrator account from environment configuration."
    });
  }
  const envBots = parseEnvBotTokens({
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    XC_BOT_TOKENS: process.env.XC_BOT_TOKENS
  });
  for (let i = 0; i < envBots.length; i++) {
    const entry = envBots[i];
    const fingerprint = hashTokenFingerprint(entry.token);
    const existing = db.prepare("SELECT id FROM bots WHERE token_fingerprint = ?").get(fingerprint);
    if (existing) continue;
    const isSandbox = entry.token.startsWith("sandbox:");
    const parsedId = isSandbox ? 72e8 + i : Number(entry.token.split(":")[0]) || 72e8 + i;
    const rawUsername = isSandbox ? entry.token.slice("sandbox:".length).replace(/[^a-zA-Z0-9_]/g, "_") || `env_bot_${i + 1}` : `bot_${parsedId}`;
    const botKey = `${rawUsername.toLowerCase().slice(0, 24)}_${generateRandomToken(4)}`;
    const encryptedToken = encryptToken(entry.token);
    const webhookSecret = entry.webhookSecret ? encryptToken(entry.webhookSecret) : null;
    const ins = db.prepare(`
        INSERT INTO bots (
          bot_key, telegram_bot_id, name, username, short_description, description,
          mode, encrypted_token, token_fingerprint, token_masked,
          connection_status, webhook_status, webhook_secret_encrypted,
          last_checked_at, last_activity_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected', 'inactive', ?, datetime('now'), datetime('now'))
      `).run(
      botKey,
      parsedId,
      entry.name || (isSandbox ? `Sandbox ${rawUsername}` : `Telegram Bot ${parsedId}`),
      rawUsername,
      "Loaded securely from server environment configuration.",
      "Bot token provisioned via server environment variable. Use Revalidate to sync live profile metadata.",
      isSandbox ? "sandbox" : "live",
      encryptedToken,
      fingerprint,
      maskToken(entry.token),
      webhookSecret
    );
    db.prepare("INSERT OR IGNORE INTO bot_settings (bot_id) VALUES (?)").run(Number(ins.lastInsertRowid));
  }
  if (process.env.XC_SEED_DEMO === "true") {
    seedDemoWorkspace(baseUrl);
  }
}

// server/security.ts
import crypto3 from "node:crypto";
var SESSION_COOKIE_NAME = "xc_session";
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = val;
  }
  return out;
}
function hashSessionToken(rawToken) {
  return crypto3.createHash("sha256").update(rawToken).digest("hex");
}
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "127.0.0.1";
}
var loginFailuresByIp = /* @__PURE__ */ new Map();
var apiRequestsByIp = /* @__PURE__ */ new Map();
function checkLoginRateLimit(ip) {
  const rec = loginFailuresByIp.get(ip);
  if (!rec) return { allowed: true };
  if (rec.lockedUntil > Date.now()) {
    return { allowed: false, retryAfterSeconds: Math.ceil((rec.lockedUntil - Date.now()) / 1e3) };
  }
  return { allowed: true };
}
function recordLoginAttempt(ip, success) {
  if (success) {
    loginFailuresByIp.delete(ip);
    return;
  }
  const existing = loginFailuresByIp.get(ip) || { count: 0, lockedUntil: 0 };
  const nextCount = existing.count + 1;
  const lockedUntil = nextCount >= 5 ? Date.now() + 6e4 : 0;
  loginFailuresByIp.set(ip, { count: nextCount >= 5 ? 0 : nextCount, lockedUntil });
}
function apiRateLimiter(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  const windowMs = 6e4;
  const maxReqs = 300;
  const current = apiRequestsByIp.get(ip);
  if (!current || now - current.windowStart > windowMs) {
    apiRequestsByIp.set(ip, { count: 1, windowStart: now });
    next();
    return;
  }
  current.count += 1;
  if (current.count > maxReqs) {
    res.status(429).json({ error: "Rate limit exceeded. Please wait a moment and retry." });
    return;
  }
  next();
}
function securityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "0");
  next();
}
function createAdminSession(params) {
  const userRow = db.prepare("SELECT username, display_name FROM admin_users WHERE id = ?").get(params.userId);
  const csrfToken = crypto3.randomBytes(24).toString("hex");
  const ttlMs = params.rememberMe ? 14 * 864e5 : 12 * 36e5;
  const expiresAt = new Date(Date.now() + ttlMs);
  const rawToken = signStatelessSession(
    {
      uid: params.userId,
      u: userRow?.username || "admin",
      dn: userRow?.display_name || "Lead Developer",
      rm: params.rememberMe,
      csrf: csrfToken,
      exp: expiresAt.getTime(),
      jti: crypto3.randomBytes(12).toString("hex")
    },
    getMasterKey()
  );
  db.prepare(`
    INSERT INTO admin_sessions (session_token_hash, csrf_token, user_id, user_agent, ip_address, remember_me, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    hashSessionToken(rawToken),
    csrfToken,
    params.userId,
    params.userAgent.slice(0, 240),
    params.ipAddress,
    params.rememberMe ? 1 : 0,
    expiresAt.toISOString()
  );
  return { rawToken, csrfToken, expiresAt };
}
function setSessionCookie(res, rawToken, expiresAt) {
  const isProd = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`
  ];
  if (isProd) {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}
function clearSessionCookie(res) {
  const isProd = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  const secureFlag = isProd ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`);
}
function resolveSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (!rawToken) {
    return { session: null, hadCookie: false };
  }
  const tokenHash = hashSessionToken(rawToken);
  const row = db.prepare(`
      SELECT s.id as session_id, s.csrf_token, s.user_id, s.remember_me, s.expires_at,
             u.username, u.display_name, u.last_login_at
      FROM admin_sessions s
      JOIN admin_users u ON u.id = s.user_id
      WHERE s.session_token_hash = ?
    `).get(tokenHash);
  if (row) {
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      db.prepare("DELETE FROM admin_sessions WHERE id = ?").run(row.session_id);
      return { session: null, hadCookie: true };
    }
    db.prepare(`UPDATE admin_sessions SET last_seen_at = datetime('now') WHERE id = ?`).run(row.session_id);
    return {
      hadCookie: true,
      session: {
        sessionId: row.session_id,
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        csrfToken: row.csrf_token,
        rememberMe: Boolean(row.remember_me),
        lastLoginAt: row.last_login_at
      }
    };
  }
  const verified = verifyStatelessSession(rawToken, getMasterKey());
  if (!verified) {
    return { session: null, hadCookie: true };
  }
  const dbUser = db.prepare("SELECT id, username, display_name, last_login_at FROM admin_users WHERE username = ?").get(verified.u);
  return {
    hadCookie: true,
    session: {
      sessionId: 0,
      userId: dbUser?.id ?? verified.uid,
      username: dbUser?.username ?? verified.u,
      displayName: dbUser?.display_name ?? verified.dn,
      csrfToken: verified.csrf,
      rememberMe: verified.rm,
      lastLoginAt: dbUser?.last_login_at ?? null
    }
  };
}
function requireAuth(req, res, next) {
  const { session, hadCookie } = resolveSessionFromRequest(req);
  if (!session) {
    if (hadCookie) {
      clearSessionCookie(res);
      res.status(401).json({ error: "Session expired. Please sign in again." });
      return;
    }
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase());
  if (mutating) {
    const headerCsrf = req.headers["x-csrf-token"];
    if (typeof headerCsrf !== "string" || headerCsrf !== session.csrfToken) {
      res.status(403).json({ error: "Invalid or missing CSRF token." });
      return;
    }
  }
  req.auth = {
    sessionId: session.sessionId,
    userId: session.userId,
    username: session.username,
    displayName: session.displayName,
    csrfToken: session.csrfToken,
    rememberMe: session.rememberMe
  };
  next();
}

// server/routes.ts
import express from "express";
import fs3 from "node:fs";
import path3 from "node:path";

// server/telegramClient.ts
async function validateTokenWithTelegram(rawToken, mode) {
  if (mode === "sandbox") {
    const slug = rawToken.trim().replace(/^sandbox:/, "");
    const cleanName = slug.split(/[_-]+/).filter(Boolean).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
    const username = slug.toLowerCase().endsWith("_bot") ? slug.toLowerCase() : `${slug.toLowerCase()}_bot`;
    let hash = 7e9;
    for (let i = 0; i < slug.length; i++) {
      hash += slug.charCodeAt(i) * (i + 17) * 131;
    }
    return {
      ok: true,
      profile: {
        id: hash,
        first_name: cleanName || "XC Sandbox Bot",
        username,
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: true
      }
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1e4);
  try {
    const resp = await fetch(`https://api.telegram.org/bot${rawToken.trim()}/getMe`, {
      method: "GET",
      signal: controller.signal
    });
    const json = await resp.json();
    if (!json.ok || !json.result) {
      return { ok: false, error: json.description || `Telegram rejected token (HTTP ${resp.status}).` };
    }
    return {
      ok: true,
      profile: {
        id: json.result.id,
        first_name: json.result.first_name,
        username: json.result.username,
        can_join_groups: Boolean(json.result.can_join_groups),
        can_read_all_group_messages: Boolean(json.result.can_read_all_group_messages),
        supports_inline_queries: Boolean(json.result.supports_inline_queries)
      }
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `Network error calling Telegram API: ${err.message}` : "Failed to reach Telegram API."
    };
  } finally {
    clearTimeout(timeout);
  }
}
async function executeBotMethod(bot, method, params = {}) {
  const startedAt = Date.now();
  let result;
  if (bot.mode === "live") {
    const token = decryptToken(bot.encrypted_token);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12e3);
    try {
      const url = `https://api.telegram.org/bot${token}/${method}`;
      const hasBody = Object.keys(params).length > 0;
      const resp = await fetch(url, {
        method: hasBody ? "POST" : "GET",
        headers: hasBody ? { "Content-Type": "application/json" } : void 0,
        body: hasBody ? JSON.stringify(params) : void 0,
        signal: controller.signal
      });
      const json = await resp.json();
      const durationMs = Math.max(1, Date.now() - startedAt);
      const ok = Boolean(json.ok);
      result = {
        ok,
        httpStatus: resp.status,
        durationMs,
        result: json.result,
        errorCode: typeof json.error_code === "number" ? json.error_code : void 0,
        description: typeof json.description === "string" ? json.description : void 0,
        rawResponse: json
      };
    } catch (err) {
      const durationMs = Math.max(1, Date.now() - startedAt);
      const msg = err instanceof Error ? err.message : "Telegram request failed";
      result = {
        ok: false,
        httpStatus: 502,
        durationMs,
        errorCode: 502,
        description: msg,
        rawResponse: { ok: false, error_code: 502, description: msg }
      };
    } finally {
      clearTimeout(timeout);
    }
  } else {
    result = executeSandboxMethod(bot, method, params, startedAt);
  }
  const safeReq = redactSecrets(JSON.stringify(params));
  const safeRes = redactSecrets(JSON.stringify(result.rawResponse));
  db.prepare(`
    INSERT INTO api_logs (
      bot_id, method, http_status, telegram_error_code, ok, duration_ms,
      request_payload_json, response_payload_json, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    bot.id,
    method,
    result.httpStatus,
    result.errorCode ?? null,
    result.ok ? 1 : 0,
    result.durationMs,
    safeReq,
    safeRes,
    result.ok ? null : result.description ?? "Unknown API error"
  );
  const nextConnStatus = result.ok ? "connected" : result.errorCode === 401 ? "invalid_token" : "api_error";
  db.prepare(`
    UPDATE bots
    SET last_checked_at = datetime('now'),
        last_activity_at = datetime('now'),
        connection_status = CASE WHEN connection_status = 'disconnected' AND ? = 'connected' THEN 'connected' ELSE ? END,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(nextConnStatus, nextConnStatus, bot.id);
  incrementDailyAnalytics({
    botId: bot.id,
    apiRequests: 1,
    apiSuccess: result.ok ? 1 : 0,
    apiFailed: result.ok ? 0 : 1,
    durationMs: result.durationMs
  });
  if (!result.ok) {
    pushNotification({
      botId: bot.id,
      severity: "error",
      title: `API Error on @${bot.username}`,
      message: `${method} failed (${result.errorCode || result.httpStatus}): ${result.description || "Unknown error"}`
    });
  }
  return result;
}
function executeSandboxMethod(bot, method, params, startedAt) {
  const durationMs = Math.max(12, Date.now() - startedAt + 18);
  const fail = (code, description) => ({
    ok: false,
    httpStatus: code,
    durationMs,
    errorCode: code,
    description,
    rawResponse: { ok: false, error_code: code, description }
  });
  const succeed = (res) => ({
    ok: true,
    httpStatus: 200,
    durationMs,
    result: res,
    rawResponse: { ok: true, result: res }
  });
  switch (method) {
    case "getMe":
      return succeed({
        id: bot.telegram_bot_id,
        is_bot: true,
        first_name: bot.name,
        username: bot.username,
        can_join_groups: Boolean(bot.can_join_groups),
        can_read_all_group_messages: Boolean(bot.can_read_all_group_messages),
        supports_inline_queries: Boolean(bot.supports_inline_queries)
      });
    case "getMyName":
      return succeed({ name: bot.name });
    case "getMyDescription":
      return succeed({ description: bot.description || "" });
    case "getMyShortDescription":
      return succeed({ short_description: bot.short_description || "" });
    case "sendMessage":
    case "sendPhoto":
    case "sendVideo":
    case "sendDocument":
    case "sendAudio":
    case "sendAnimation":
    case "sendVoice":
    case "sendLocation":
    case "sendContact":
    case "sendPoll":
    case "sendMediaGroup": {
      const chatId = String(params.chat_id ?? "").trim();
      if (!chatId) {
        return fail(400, "Bad Request: chat_id is empty");
      }
      if (method === "sendMessage" && !String(params.text ?? "").trim()) {
        return fail(400, "Bad Request: message text is empty");
      }
      if (chatId === "invalid_chat" || chatId === "0") {
        return fail(400, "Bad Request: chat not found");
      }
      const messageId = Math.floor(1e3 + Math.random() * 89e3);
      const chatRow = db.prepare("SELECT * FROM bot_chats WHERE bot_id = ? AND chat_id = ?").get(bot.id, chatId);
      const chatObj = chatRow ? {
        id: chatRow.chat_id,
        type: chatRow.chat_type,
        title: chatRow.title || void 0,
        username: chatRow.username || void 0,
        first_name: chatRow.first_name || void 0
      } : { id: chatId, type: chatId.startsWith("-100") ? "supergroup" : chatId.startsWith("@") ? "channel" : "private" };
      return succeed({
        message_id: messageId,
        from: { id: bot.telegram_bot_id, is_bot: true, first_name: bot.name, username: bot.username },
        chat: chatObj,
        date: Math.floor(Date.now() / 1e3),
        text: params.text || params.caption || params.question || `[${method}]`,
        reply_markup: params.reply_markup || void 0
      });
    }
    case "getWebhookInfo":
      return succeed({
        url: bot.webhook_url || "",
        has_custom_certificate: false,
        pending_update_count: bot.pending_update_count || 0,
        last_error_message: bot.last_webhook_error || void 0,
        max_connections: 40,
        ip_address: "149.154.167.220"
      });
    case "setWebhook": {
      const url = String(params.url ?? "").trim();
      if (!url.startsWith("https://")) {
        return fail(400, "Bad Request: bad webhook: HTTPS url must be provided for webhook");
      }
      const secret = typeof params.secret_token === "string" && params.secret_token ? params.secret_token : generateRandomToken(16);
      db.prepare(`
        UPDATE bots
        SET webhook_url = ?, webhook_status = 'active', webhook_secret_encrypted = ?, last_webhook_error = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(url, encryptToken(secret), bot.id);
      return succeed(true);
    }
    case "deleteWebhook":
      db.prepare(`
        UPDATE bots
        SET webhook_url = NULL, webhook_status = 'inactive', pending_update_count = 0, updated_at = datetime('now')
        WHERE id = ?
      `).run(bot.id);
      return succeed(true);
    case "getUpdates": {
      if (bot.webhook_status === "active" && bot.webhook_url) {
        return fail(409, "Conflict: can't use getUpdates method while webhook is active; use deleteWebhook to delete the webhook first");
      }
      const rows = db.prepare("SELECT raw_json FROM bot_updates WHERE bot_id = ? ORDER BY update_id DESC LIMIT 20").all(bot.id);
      return succeed(rows.map((r) => JSON.parse(r.raw_json)));
    }
    case "getMyCommands": {
      const rows = db.prepare("SELECT command, description FROM bot_commands WHERE bot_id = ? ORDER BY sort_order ASC").all(bot.id);
      return succeed(rows);
    }
    case "setMyCommands": {
      if (!Array.isArray(params.commands)) {
        return fail(400, "Bad Request: commands must be an array");
      }
      return succeed(true);
    }
    case "deleteMyCommands":
      return succeed(true);
    case "getChat": {
      const chatId = String(params.chat_id ?? "").trim();
      if (!chatId) return fail(400, "Bad Request: chat_id is required");
      const row = db.prepare("SELECT * FROM bot_chats WHERE bot_id = ? AND chat_id = ?").get(bot.id, chatId);
      if (!row) {
        return fail(400, "Bad Request: chat not found");
      }
      return succeed({
        id: row.chat_id,
        type: row.chat_type,
        title: row.title || void 0,
        username: row.username || void 0,
        first_name: row.first_name || void 0,
        last_name: row.last_name || void 0
      });
    }
    case "getChatAdministrators": {
      const chatId = String(params.chat_id ?? "").trim();
      if (!chatId) return fail(400, "Bad Request: chat_id is required");
      return succeed([
        {
          status: "creator",
          user: { id: 104829104, is_bot: false, first_name: "Sara", username: "sara_lin" }
        },
        {
          status: "administrator",
          user: { id: bot.telegram_bot_id, is_bot: true, first_name: bot.name, username: bot.username },
          can_manage_chat: true,
          can_delete_messages: true
        }
      ]);
    }
    case "getChatMember":
      return succeed({
        status: "member",
        user: { id: Number(params.user_id) || 104829104, is_bot: false, first_name: "Member" }
      });
    case "banChatMember":
    case "unbanChatMember":
    case "restrictChatMember":
    case "promoteChatMember":
      if (!params.chat_id || !params.user_id) {
        return fail(400, "Bad Request: chat_id and user_id are required");
      }
      return succeed(true);
    default:
      return fail(404, `Not Found: unsupported method ${method}`);
  }
}
function processIncomingWebhookUpdate(params) {
  const { bot, secretHeader, payload } = params;
  if (bot.webhook_secret_encrypted) {
    const expectedSecret = decryptToken(bot.webhook_secret_encrypted);
    if (!secretHeader || secretHeader !== expectedSecret) {
      db.prepare(`
        INSERT INTO webhook_logs (bot_id, update_id, http_status, secret_verified, status, error_message, payload_preview)
        VALUES (?, ?, 401, 0, 'rejected', 'Invalid X-Telegram-Bot-Api-Secret-Token header', ?)
      `).run(bot.id, typeof payload.update_id === "number" ? payload.update_id : null, redactSecrets(JSON.stringify(payload).slice(0, 240)));
      return { httpStatus: 401, ok: false, status: "rejected", message: "Webhook secret token verification failed." };
    }
  }
  const updateId = payload.update_id;
  if (typeof updateId !== "number" || !Number.isInteger(updateId)) {
    db.prepare(`
      INSERT INTO webhook_logs (bot_id, update_id, http_status, secret_verified, status, error_message, payload_preview)
      VALUES (?, NULL, 400, 1, 'error', 'Missing numeric update_id', ?)
    `).run(bot.id, redactSecrets(JSON.stringify(payload).slice(0, 240)));
    return { httpStatus: 400, ok: false, status: "error", message: "Invalid Telegram Update: numeric update_id required." };
  }
  const updateKeys = [
    "message",
    "edited_message",
    "channel_post",
    "edited_channel_post",
    "callback_query",
    "inline_query",
    "chosen_inline_result",
    "my_chat_member",
    "chat_member",
    "chat_join_request"
  ];
  const updateType = updateKeys.find((k) => payload[k] && typeof payload[k] === "object") || "other";
  const inner = payload[updateType] || {};
  const chatObj = inner.chat || inner.message?.chat || void 0;
  const fromObj = inner.from || void 0;
  const chatId = chatObj?.id !== void 0 ? String(chatObj.id) : null;
  const senderUsername = typeof fromObj?.username === "string" ? fromObj.username : null;
  const summary = typeof inner.text === "string" ? inner.text.slice(0, 140) : typeof inner.data === "string" ? `Callback: ${inner.data}` : typeof inner.query === "string" ? `Inline: ${inner.query}` : `${updateType} #${updateId}`;
  const safeRaw = redactSecrets(JSON.stringify(payload));
  try {
    db.prepare(`
      INSERT INTO bot_updates (bot_id, update_id, update_type, chat_id, sender_username, summary, processing_status, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, 'processed', ?)
    `).run(bot.id, updateId, updateType, chatId, senderUsername, summary, safeRaw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("UNIQUE")) {
      db.prepare(`
        INSERT INTO webhook_logs (bot_id, update_id, http_status, secret_verified, status, error_message, payload_preview)
        VALUES (?, ?, 200, 1, 'duplicate', 'Duplicate update_id ignored by idempotency constraint', ?)
      `).run(bot.id, updateId, summary);
      return {
        httpStatus: 200,
        ok: true,
        status: "duplicate",
        message: `Update #${updateId} already processed (duplicate prevented).`
      };
    }
    throw err;
  }
  if (chatObj && chatObj.id !== void 0) {
    const cType = String(chatObj.type || "private");
    const validType = ["private", "group", "supergroup", "channel"].includes(cType) ? cType : "private";
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
      String(chatObj.id),
      validType,
      typeof chatObj.title === "string" ? chatObj.title : null,
      typeof chatObj.username === "string" ? chatObj.username : null,
      typeof chatObj.first_name === "string" ? chatObj.first_name : null,
      typeof chatObj.last_name === "string" ? chatObj.last_name : null
    );
  }
  db.prepare(`
    INSERT INTO webhook_logs (bot_id, update_id, http_status, secret_verified, status, payload_preview)
    VALUES (?, ?, 200, 1, 'accepted', ?)
  `).run(bot.id, updateId, summary);
  db.prepare(`UPDATE bots SET last_activity_at = datetime('now') WHERE id = ?`).run(bot.id);
  incrementDailyAnalytics({ botId: bot.id, updatesReceived: 1 });
  logActivity({
    action: "WEBHOOK_UPDATE_RECEIVED",
    botId: bot.id,
    botName: bot.name,
    status: "success",
    relatedResource: `update:${updateId}`,
    details: `${updateType} \xB7 ${summary}`
  });
  return {
    httpStatus: 200,
    ok: true,
    status: "accepted",
    message: `Update #${updateId} (${updateType}) verified and stored.`
  };
}

// server/routes.ts
var apiRouter = express.Router();
function sanitizeBotForClient(row) {
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
    has_webhook_secret: Boolean(row.webhook_secret_encrypted),
    pending_update_count: row.pending_update_count,
    last_webhook_error: row.last_webhook_error,
    can_join_groups: Boolean(row.can_join_groups),
    can_read_all_group_messages: Boolean(row.can_read_all_group_messages),
    supports_inline_queries: Boolean(row.supports_inline_queries),
    last_checked_at: row.last_checked_at,
    last_activity_at: row.last_activity_at
  };
}
function getBotById(botId) {
  return db.prepare("SELECT * FROM bots WHERE id = ?").get(botId);
}
apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true, status: "operational" });
});
apiRouter.post("/webhook/:botKey", (req, res) => {
  const { botKey } = req.params;
  const bot = db.prepare("SELECT * FROM bots WHERE bot_key = ?").get(botKey);
  if (!bot) {
    res.status(404).json({ ok: false, error: "Bot endpoint not found" });
    return;
  }
  const secretHeader = req.headers["x-telegram-bot-api-secret-token"];
  const payload = req.body && typeof req.body === "object" ? req.body : {};
  const outcome = processIncomingWebhookUpdate({
    bot,
    secretHeader: typeof secretHeader === "string" ? secretHeader : void 0,
    payload
  });
  res.status(outcome.httpStatus).json({ ok: outcome.ok, status: outcome.status, message: outcome.message });
});
apiRouter.get("/auth/status", (req, res) => {
  const adminCount = db.prepare("SELECT COUNT(*) as cnt FROM admin_users").get().cnt;
  const { session, hadCookie } = resolveSessionFromRequest(req);
  if (!session) {
    if (hadCookie) {
      clearSessionCookie(res);
    }
    res.json({
      setupRequired: adminCount === 0,
      authenticated: false
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
      lastLoginAt: session.lastLoginAt
    }
  });
});
apiRouter.post("/auth/setup", (req, res) => {
  const adminCount = db.prepare("SELECT COUNT(*) as cnt FROM admin_users").get().cnt;
  if (adminCount > 0) {
    res.status(403).json({ error: "Administrator account already exists. Initial setup is locked." });
    return;
  }
  const username = String(req.body?.username ?? "").trim();
  const displayName = String(req.body?.displayName ?? username).trim();
  const password = String(req.body?.password ?? "");
  const recoveryHint = String(req.body?.recoveryHint ?? "").trim();
  const seedDemo = Boolean(req.body?.seedDemo ?? true);
  if (username.length < 3 || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
    res.status(400).json({ error: "Username must be at least 3 characters (letters, numbers, _, ., -)." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters long." });
    return;
  }
  const passwordHash = hashPassword(password);
  const insert = db.prepare(`
      INSERT INTO admin_users (username, display_name, password_hash, recovery_hint, last_login_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(username, displayName || username, passwordHash, recoveryHint || null);
  const userId = Number(insert.lastInsertRowid);
  const ip = getClientIp(req);
  if (seedDemo) {
    const baseUrl = getSuggestedWebhookBaseUrl({
      appUrl: process.env.APP_URL,
      vercelProdUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
      vercelUrl: process.env.VERCEL_URL,
      host: req.get("host"),
      proto: String(req.headers["x-forwarded-proto"] || req.protocol)
    });
    seedDemoWorkspace(baseUrl);
  }
  const session = createAdminSession({
    userId,
    rememberMe: true,
    ipAddress: ip,
    userAgent: String(req.headers["user-agent"] || "Unknown")
  });
  setSessionCookie(res, session.rawToken, session.expiresAt);
  db.prepare(`INSERT INTO login_history (username, success, ip_address, user_agent, reason) VALUES (?, 1, ?, ?, 'Initial setup')`).run(
    username,
    ip,
    String(req.headers["user-agent"] || "Unknown").slice(0, 200)
  );
  logActivity({
    action: "ADMIN_SETUP_COMPLETE",
    status: "success",
    relatedResource: username,
    details: "Created single-admin account and locked setup.",
    ipAddress: ip
  });
  res.status(201).json({
    ok: true,
    csrfToken: session.csrfToken,
    admin: { id: userId, username, displayName: displayName || username }
  });
});
apiRouter.post("/auth/autostart", (req, res) => {
  let admin = db.prepare("SELECT id, username, display_name FROM admin_users LIMIT 1").get();
  if (!admin) {
    const pw = generateRandomToken(12);
    const ins = db.prepare(`
        INSERT INTO admin_users (username, display_name, password_hash, recovery_hint, last_login_at)
        VALUES ('admin', 'Lead Developer', ?, 'Configured via XC_RECOVERY_CODE', datetime('now'))
      `).run(hashPassword(pw));
    admin = { id: Number(ins.lastInsertRowid), username: "admin", display_name: "Lead Developer" };
  }
  const baseUrl = getSuggestedWebhookBaseUrl({
    appUrl: process.env.APP_URL,
    vercelProdUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    vercelUrl: process.env.VERCEL_URL,
    host: req.get("host"),
    proto: String(req.headers["x-forwarded-proto"] || req.protocol)
  });
  seedDemoWorkspace(baseUrl);
  const session = createAdminSession({
    userId: admin.id,
    rememberMe: true,
    ipAddress: getClientIp(req),
    userAgent: String(req.headers["user-agent"] || "Unknown")
  });
  setSessionCookie(res, session.rawToken, session.expiresAt);
  res.json({
    ok: true,
    csrfToken: session.csrfToken,
    admin: { id: admin.id, username: admin.username, displayName: admin.display_name }
  });
});
apiRouter.post("/auth/login", (req, res) => {
  const ip = getClientIp(req);
  const rate = checkLoginRateLimit(ip);
  if (!rate.allowed) {
    res.status(429).json({
      error: `Too many failed login attempts. Try again in ${rate.retryAfterSeconds}s.`
    });
    return;
  }
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");
  const rememberMe = Boolean(req.body?.rememberMe);
  const ua = String(req.headers["user-agent"] || "Unknown").slice(0, 200);
  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required." });
    return;
  }
  const user = db.prepare("SELECT * FROM admin_users WHERE username = ?").get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordLoginAttempt(ip, false);
    db.prepare(`INSERT INTO login_history (username, success, ip_address, user_agent, reason) VALUES (?, 0, ?, ?, 'Invalid credentials')`).run(
      username,
      ip,
      ua
    );
    logActivity({
      action: "ADMIN_LOGIN_FAILED",
      status: "warning",
      relatedResource: username,
      details: "Invalid username or password attempt.",
      ipAddress: ip
    });
    res.status(401).json({ error: "Invalid username or password." });
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
    userAgent: ua
  });
  setSessionCookie(res, session.rawToken, session.expiresAt);
  logActivity({
    action: "ADMIN_LOGIN",
    status: "success",
    relatedResource: user.username,
    details: rememberMe ? "Signed in (Remember Me enabled)." : "Signed in.",
    ipAddress: ip
  });
  res.json({
    ok: true,
    csrfToken: session.csrfToken,
    admin: { id: user.id, username: user.username, displayName: user.display_name }
  });
});
apiRouter.post("/auth/recover", (req, res) => {
  const recoveryCode = String(req.body?.recoveryCode ?? "").trim();
  const newPassword = String(req.body?.newPassword ?? "");
  const expectedCode = process.env.XC_RECOVERY_CODE || "XC-RECOVERY-2026";
  if (!recoveryCode || recoveryCode !== expectedCode) {
    res.status(403).json({ error: "Invalid configured recovery code." });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters." });
    return;
  }
  const admin = db.prepare("SELECT id, username FROM admin_users LIMIT 1").get();
  if (!admin) {
    res.status(404).json({ error: "No administrator account configured yet." });
    return;
  }
  db.prepare(`UPDATE admin_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
    hashPassword(newPassword),
    admin.id
  );
  db.prepare("DELETE FROM admin_sessions WHERE user_id = ?").run(admin.id);
  logActivity({
    action: "ADMIN_PASSWORD_RECOVERED",
    status: "warning",
    relatedResource: admin.username,
    details: "Password reset via configured recovery code.",
    ipAddress: getClientIp(req)
  });
  res.json({ ok: true, message: "Password updated. You can now sign in with your new password." });
});
apiRouter.use(requireAuth);
apiRouter.post("/auth/logout", (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (rawToken) {
    db.prepare("DELETE FROM admin_sessions WHERE session_token_hash = ?").run(hashSessionToken(rawToken));
  }
  clearSessionCookie(res);
  logActivity({
    action: "ADMIN_LOGOUT",
    status: "success",
    relatedResource: req.auth?.username,
    details: "Administrator signed out.",
    ipAddress: getClientIp(req)
  });
  res.json({ ok: true });
});
apiRouter.post("/auth/change-password", (req, res) => {
  const currentPassword = String(req.body?.currentPassword ?? "");
  const newPassword = String(req.body?.newPassword ?? "");
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters." });
    return;
  }
  const user = db.prepare("SELECT id, username, password_hash FROM admin_users WHERE id = ?").get(req.auth.userId);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    res.status(400).json({ error: "Current password is incorrect." });
    return;
  }
  db.prepare(`UPDATE admin_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
    hashPassword(newPassword),
    user.id
  );
  logActivity({
    action: "ADMIN_PASSWORD_CHANGED",
    status: "success",
    relatedResource: user.username,
    details: "Administrator password rotated.",
    ipAddress: getClientIp(req)
  });
  res.json({ ok: true, message: "Password changed successfully." });
});
apiRouter.get("/auth/sessions", (req, res) => {
  const sessions = db.prepare(`
      SELECT id, user_agent, ip_address, remember_me, expires_at, created_at, last_seen_at
      FROM admin_sessions
      WHERE user_id = ?
      ORDER BY last_seen_at DESC
    `).all(req.auth.userId);
  const loginHistory = db.prepare(`SELECT id, username, success, ip_address, user_agent, reason, created_at FROM login_history ORDER BY created_at DESC LIMIT 20`).all();
  res.json({
    currentSessionId: req.auth.sessionId,
    sessions,
    loginHistory
  });
});
apiRouter.delete("/auth/sessions/:id", (req, res) => {
  const id = Number(req.params.id);
  if (id === req.auth.sessionId) {
    res.status(400).json({ error: "Use Sign Out to end your active session." });
    return;
  }
  db.prepare("DELETE FROM admin_sessions WHERE id = ? AND user_id = ?").run(id, req.auth.userId);
  res.json({ ok: true });
});
apiRouter.get("/dashboard", (req, res) => {
  const botIdFilter = req.query.botId ? Number(req.query.botId) : null;
  const bots = db.prepare("SELECT * FROM bots ORDER BY created_at DESC").all();
  const totalBots = bots.length;
  const activeBots = bots.filter((b) => b.connection_status === "connected").length;
  const inactiveBots = totalBots - activeBots;
  const msgWhere = botIdFilter ? "WHERE bot_id = ?" : "";
  const msgParams = botIdFilter ? [botIdFilter] : [];
  const messagesSent = db.prepare(`SELECT COUNT(*) as cnt FROM bot_messages ${msgWhere}`).get(...msgParams).cnt;
  const updatesReceived = db.prepare(`SELECT COUNT(*) as cnt FROM bot_updates ${msgWhere}`).get(...msgParams).cnt;
  const apiAgg = db.prepare(
    `SELECT COUNT(*) as total,
              SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) as success,
              SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) as failed
       FROM api_logs ${msgWhere}`
  ).get(...msgParams);
  const dailyTotals = db.prepare(
    `SELECT COALESCE(SUM(messages_sent), 0) as msgs,
              COALESCE(SUM(updates_received), 0) as upds,
              COALESCE(SUM(api_requests), 0) as reqs,
              COALESCE(SUM(api_success), 0) as ok_cnt,
              COALESCE(SUM(api_failed), 0) as fail_cnt
       FROM analytics_daily ${msgWhere}`
  ).get(...msgParams);
  const series = db.prepare(
    `SELECT metric_date as date,
              SUM(messages_sent) as messages_sent,
              SUM(updates_received) as updates_received,
              SUM(api_requests) as api_requests,
              SUM(api_success) as api_success,
              SUM(api_failed) as api_failed
       FROM analytics_daily
       ${botIdFilter ? "WHERE bot_id = ?" : ""}
       GROUP BY metric_date
       ORDER BY metric_date ASC
       LIMIT 30`
  ).all(...msgParams);
  const recentUpdates = db.prepare(`
      SELECT u.id, u.bot_id, b.name as bot_name, b.username as bot_username, u.update_id, u.update_type, u.summary, u.processing_status, u.received_at
      FROM bot_updates u
      JOIN bots b ON b.id = u.bot_id
      ${botIdFilter ? "WHERE u.bot_id = ?" : ""}
      ORDER BY u.received_at DESC LIMIT 6
    `).all(...msgParams);
  const recentMessages = db.prepare(`
      SELECT m.id, m.bot_id, b.name as bot_name, m.chat_id, m.message_type, m.content_preview, m.delivery_status, m.sent_at
      FROM bot_messages m
      JOIN bots b ON b.id = m.bot_id
      ${botIdFilter ? "WHERE m.bot_id = ?" : ""}
      ORDER BY m.sent_at DESC LIMIT 6
    `).all(...msgParams);
  const recentApiRequests = db.prepare(`
      SELECT a.id, a.bot_id, b.username as bot_username, a.method, a.http_status, a.ok, a.duration_ms, a.error_message, a.created_at
      FROM api_logs a
      LEFT JOIN bots b ON b.id = a.bot_id
      ${botIdFilter ? "WHERE a.bot_id = ?" : ""}
      ORDER BY a.created_at DESC LIMIT 8
    `).all(...msgParams);
  res.json({
    stats: {
      totalBots,
      activeBots,
      inactiveBots,
      totalMessagesSent: Math.max(messagesSent, dailyTotals.msgs),
      totalUpdatesReceived: Math.max(updatesReceived, dailyTotals.upds),
      totalApiRequests: Math.max(apiAgg.total, dailyTotals.reqs),
      successfulApiRequests: Math.max(apiAgg.success || 0, dailyTotals.ok_cnt),
      failedApiRequests: Math.max(apiAgg.failed || 0, dailyTotals.fail_cnt)
    },
    bots: bots.map(sanitizeBotForClient),
    series,
    recentUpdates,
    recentMessages,
    recentApiRequests
  });
});
apiRouter.get("/bots", (_req, res) => {
  const rows = db.prepare("SELECT * FROM bots ORDER BY created_at DESC").all();
  const enriched = rows.map((b) => {
    const chatsCount = db.prepare("SELECT COUNT(*) as c FROM bot_chats WHERE bot_id = ?").get(b.id).c;
    const msgsCount = db.prepare("SELECT COUNT(*) as c FROM bot_messages WHERE bot_id = ?").get(b.id).c;
    const updatesCount = db.prepare("SELECT COUNT(*) as c FROM bot_updates WHERE bot_id = ?").get(b.id).c;
    const settings = db.prepare("SELECT * FROM bot_settings WHERE bot_id = ?").get(b.id);
    return {
      ...sanitizeBotForClient(b),
      counts: { chats: chatsCount, messages: msgsCount, updates: updatesCount },
      settings
    };
  });
  res.json({ bots: enriched });
});
apiRouter.post("/bots/validate-token", async (req, res) => {
  const rawToken = String(req.body?.token ?? "").trim();
  const format = validateBotTokenFormat(rawToken, true);
  if (!format.valid || !format.mode) {
    res.status(400).json({ ok: false, error: format.error });
    return;
  }
  const fingerprint = hashTokenFingerprint(rawToken);
  const existing = db.prepare("SELECT id, username FROM bots WHERE token_fingerprint = ?").get(fingerprint);
  if (existing) {
    res.status(409).json({
      ok: false,
      error: `Duplicate token detected: this token is already connected as @${existing.username}.`
    });
    return;
  }
  const validation = await validateTokenWithTelegram(rawToken, format.mode);
  if (!validation.ok || !validation.profile) {
    res.status(400).json({ ok: false, error: validation.error || "Token validation failed." });
    return;
  }
  res.json({
    ok: true,
    mode: format.mode,
    token_masked: maskToken(rawToken),
    profile: validation.profile
  });
});
apiRouter.post("/bots", async (req, res) => {
  const rawToken = String(req.body?.token ?? "").trim();
  const customName = String(req.body?.name ?? "").trim();
  const shortDesc = String(req.body?.short_description ?? "").trim();
  const format = validateBotTokenFormat(rawToken, true);
  if (!format.valid || !format.mode) {
    res.status(400).json({ error: format.error });
    return;
  }
  const fingerprint = hashTokenFingerprint(rawToken);
  const dup = db.prepare("SELECT id, username FROM bots WHERE token_fingerprint = ?").get(fingerprint);
  if (dup) {
    res.status(409).json({ error: `This bot token is already connected (@${dup.username}).` });
    return;
  }
  const validation = await validateTokenWithTelegram(rawToken, format.mode);
  if (!validation.ok || !validation.profile) {
    res.status(400).json({ error: validation.error || "Telegram getMe validation failed." });
    return;
  }
  const p = validation.profile;
  const botKey = `${p.username.toLowerCase().replace(/[^a-z0-9_]/g, "_")}_${Date.now().toString(36).slice(-4)}`;
  const secretToken = generateRandomToken(16);
  const insert = db.prepare(`
      INSERT INTO bots (
        bot_key, telegram_bot_id, name, username, short_description, mode,
        encrypted_token, token_fingerprint, token_masked,
        connection_status, webhook_status, webhook_secret_encrypted,
        can_join_groups, can_read_all_group_messages, supports_inline_queries,
        last_checked_at, last_activity_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected', 'inactive', ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
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
  db.prepare("INSERT INTO bot_settings (bot_id) VALUES (?)").run(botId);
  logActivity({
    action: "BOT_ADDED",
    botId,
    botName: customName || p.first_name,
    status: "success",
    relatedResource: `@${p.username}`,
    details: `Connected ${format.mode} bot (ID ${p.id}) with encrypted token storage.`,
    ipAddress: getClientIp(req)
  });
  pushNotification({
    botId,
    severity: "success",
    title: "Bot Connected",
    message: `@${p.username} verified via getMe and encrypted at rest.`
  });
  const saved = getBotById(botId);
  res.status(201).json({ ok: true, bot: sanitizeBotForClient(saved) });
});
apiRouter.get("/bots/:id", (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: "Bot not found." });
    return;
  }
  const settings = db.prepare("SELECT * FROM bot_settings WHERE bot_id = ?").get(bot.id);
  const counts = {
    chats: db.prepare("SELECT COUNT(*) as c FROM bot_chats WHERE bot_id = ?").get(bot.id).c,
    messages: db.prepare("SELECT COUNT(*) as c FROM bot_messages WHERE bot_id = ?").get(bot.id).c,
    updates: db.prepare("SELECT COUNT(*) as c FROM bot_updates WHERE bot_id = ?").get(bot.id).c,
    commands: db.prepare("SELECT COUNT(*) as c FROM bot_commands WHERE bot_id = ?").get(bot.id).c
  };
  res.json({ bot: sanitizeBotForClient(bot), settings, counts });
});
apiRouter.patch("/bots/:id", (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: "Bot not found." });
    return;
  }
  const name = String(req.body?.name ?? bot.name).trim();
  const shortDesc = String(req.body?.short_description ?? bot.short_description).trim();
  const description = String(req.body?.description ?? bot.description).trim();
  const status = req.body?.connection_status;
  const nextStatus = ["connected", "disconnected"].includes(status) ? status : bot.connection_status;
  if (!name) {
    res.status(400).json({ error: "Bot name cannot be empty." });
    return;
  }
  db.prepare(`
    UPDATE bots
    SET name = ?, short_description = ?, description = ?, connection_status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(name, shortDesc, description, nextStatus, bot.id);
  logActivity({
    action: "BOT_UPDATED",
    botId: bot.id,
    botName: name,
    status: "success",
    relatedResource: `@${bot.username}`,
    details: "Updated bot profile configuration.",
    ipAddress: getClientIp(req)
  });
  res.json({ ok: true, bot: sanitizeBotForClient(getBotById(bot.id)) });
});
apiRouter.patch("/bots/:id/settings", (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: "Bot not found." });
    return;
  }
  const parseMode = ["HTML", "MarkdownV2", "None"].includes(req.body?.default_parse_mode) ? req.body.default_parse_mode : "HTML";
  const disableNotification = req.body?.disable_notification ? 1 : 0;
  const protectContent = req.body?.protect_content ? 1 : 0;
  const autoStoreUpdates = req.body?.auto_store_updates === false ? 0 : 1;
  db.prepare(`
    UPDATE bot_settings
    SET default_parse_mode = ?, disable_notification = ?, protect_content = ?, auto_store_updates = ?, updated_at = datetime('now')
    WHERE bot_id = ?
  `).run(parseMode, disableNotification, protectContent, autoStoreUpdates, bot.id);
  logActivity({
    action: "BOT_SETTINGS_UPDATED",
    botId: bot.id,
    botName: bot.name,
    status: "success",
    relatedResource: `@${bot.username}`,
    details: `Default parse mode: ${parseMode}`
  });
  res.json({ ok: true, settings: db.prepare("SELECT * FROM bot_settings WHERE bot_id = ?").get(bot.id) });
});
apiRouter.post("/bots/:id/revalidate", async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: "Bot not found." });
    return;
  }
  const rawToken = decryptToken(bot.encrypted_token);
  const check = await validateTokenWithTelegram(rawToken, bot.mode);
  if (!check.ok || !check.profile) {
    db.prepare(`UPDATE bots SET connection_status = 'invalid_token', last_checked_at = datetime('now') WHERE id = ?`).run(bot.id);
    res.status(400).json({ ok: false, error: check.error || "Token validation failed.", bot: sanitizeBotForClient(getBotById(bot.id)) });
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
  res.json({ ok: true, bot: sanitizeBotForClient(getBotById(bot.id)) });
});
apiRouter.post("/bots/:id/test-connection", async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: "Bot not found." });
    return;
  }
  const outcome = await executeBotMethod(bot, "getMe", {});
  res.json({
    ok: outcome.ok,
    durationMs: outcome.durationMs,
    httpStatus: outcome.httpStatus,
    response: outcome.rawResponse,
    bot: sanitizeBotForClient(getBotById(bot.id))
  });
});
apiRouter.delete("/bots/:id", (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: "Bot not found." });
    return;
  }
  db.prepare("DELETE FROM bots WHERE id = ?").run(bot.id);
  logActivity({
    action: "BOT_REMOVED",
    botId: null,
    botName: bot.name,
    status: "warning",
    relatedResource: `@${bot.username}`,
    details: "Removed bot and purged encrypted credentials.",
    ipAddress: getClientIp(req)
  });
  res.json({ ok: true });
});
apiRouter.get("/bots/:id/messages", (req, res) => {
  const botId = Number(req.params.id);
  const rows = db.prepare("SELECT * FROM bot_messages WHERE bot_id = ? ORDER BY sent_at DESC LIMIT 100").all(botId);
  res.json({ messages: rows });
});
apiRouter.post("/bots/:id/messages", async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: "Bot not found." });
    return;
  }
  const messageType = String(req.body?.messageType ?? "text");
  const chatId = String(req.body?.chatId ?? "").trim();
  const text = String(req.body?.text ?? "");
  const mediaUrl = String(req.body?.mediaUrl ?? "").trim();
  const parseMode = req.body?.parseMode && req.body.parseMode !== "None" ? String(req.body.parseMode) : void 0;
  const disableNotification = Boolean(req.body?.disableNotification);
  const protectContent = Boolean(req.body?.protectContent);
  const replyMarkup = req.body?.replyMarkup ?? void 0;
  if (!chatId) {
    res.status(400).json({ error: "Target Chat ID is required." });
    return;
  }
  const methodMap = {
    text: "sendMessage",
    photo: "sendPhoto",
    video: "sendVideo",
    document: "sendDocument",
    audio: "sendAudio",
    voice: "sendVoice",
    animation: "sendAnimation",
    location: "sendLocation",
    contact: "sendContact",
    poll: "sendPoll",
    media_group: "sendMediaGroup"
  };
  const method = methodMap[messageType];
  if (!method) {
    res.status(400).json({ error: `Unsupported message type: ${messageType}` });
    return;
  }
  const payload = { chat_id: chatId };
  if (disableNotification) payload.disable_notification = true;
  if (protectContent) payload.protect_content = true;
  if (replyMarkup) payload.reply_markup = replyMarkup;
  let preview = text;
  if (messageType === "text") {
    if (!text.trim()) {
      res.status(400).json({ error: "Message text cannot be empty." });
      return;
    }
    payload.text = text;
    if (parseMode) payload.parse_mode = parseMode;
  } else if (["photo", "video", "document", "audio", "voice", "animation"].includes(messageType)) {
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
  } else if (messageType === "location") {
    const lat = Number(req.body?.latitude);
    const lon = Number(req.body?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(400).json({ error: "Valid numeric latitude and longitude are required." });
      return;
    }
    payload.latitude = lat;
    payload.longitude = lon;
    preview = `Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
  } else if (messageType === "contact") {
    const phone = String(req.body?.phoneNumber ?? "").trim();
    const firstName = String(req.body?.firstName ?? "").trim();
    if (!phone || !firstName) {
      res.status(400).json({ error: "Contact phone number and first name are required." });
      return;
    }
    payload.phone_number = phone;
    payload.first_name = firstName;
    if (req.body?.lastName) payload.last_name = String(req.body.lastName);
    preview = `Contact: ${firstName} (${phone})`;
  } else if (messageType === "poll") {
    const question = String(req.body?.pollQuestion ?? "").trim();
    const options = Array.isArray(req.body?.pollOptions) ? req.body.pollOptions.filter((o) => String(o).trim()) : [];
    if (!question || options.length < 2) {
      res.status(400).json({ error: "Poll requires a question and at least 2 options." });
      return;
    }
    payload.question = question;
    payload.options = options;
    payload.is_anonymous = req.body?.pollAnonymous !== false;
    preview = `Poll: ${question}`;
  } else if (messageType === "media_group") {
    const items = Array.isArray(req.body?.mediaGroup) ? req.body.mediaGroup : [];
    if (items.length < 2) {
      res.status(400).json({ error: "Media Group requires at least 2 media URLs." });
      return;
    }
    payload.media = items;
    preview = `Media Group (${items.length} items)`;
  }
  const outcome = await executeBotMethod(bot, method, payload);
  const tgMsgId = outcome.ok && outcome.result && typeof outcome.result.message_id === "number" ? Number(outcome.result.message_id) : null;
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
    outcome.ok ? "sent" : "failed",
    redactSecrets(JSON.stringify(outcome.rawResponse)),
    outcome.ok ? null : outcome.description || "Delivery failed"
  );
  if (outcome.ok) {
    incrementDailyAnalytics({ botId: bot.id, messagesSent: 1 });
    db.prepare(`
      INSERT INTO bot_chats (bot_id, chat_id, chat_type, last_interaction_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(bot_id, chat_id) DO UPDATE SET last_interaction_at = datetime('now')
    `).run(bot.id, chatId, chatId.startsWith("-100") ? "supergroup" : chatId.startsWith("-") ? "group" : chatId.startsWith("@") ? "channel" : "private");
  }
  logActivity({
    action: "MESSAGE_SENT",
    botId: bot.id,
    botName: bot.name,
    status: outcome.ok ? "success" : "failed",
    relatedResource: `${method} -> ${chatId}`,
    details: outcome.ok ? preview.slice(0, 120) : outcome.description || "Failed",
    ipAddress: getClientIp(req)
  });
  res.status(outcome.ok ? 200 : 400).json({
    ok: outcome.ok,
    durationMs: outcome.durationMs,
    response: outcome.rawResponse,
    error: outcome.ok ? void 0 : outcome.description
  });
});
apiRouter.get("/bots/:id/chats", (req, res) => {
  const botId = Number(req.params.id);
  const type = typeof req.query.type === "string" && req.query.type !== "all" ? req.query.type : null;
  const search = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  let sql = "SELECT * FROM bot_chats WHERE bot_id = ?";
  const params = [botId];
  if (type) {
    sql += " AND chat_type = ?";
    params.push(type);
  }
  if (search) {
    sql += ' AND (LOWER(chat_id) LIKE ? OR LOWER(COALESCE(title,"")) LIKE ? OR LOWER(COALESCE(username,"")) LIKE ? OR LOWER(COALESCE(first_name,"")) LIKE ?)';
    const pat = `%${search}%`;
    params.push(pat, pat, pat, pat);
  }
  sql += " ORDER BY last_interaction_at DESC";
  const chats = db.prepare(sql).all(...params);
  res.json({ chats });
});
apiRouter.post("/bots/:id/chats/lookup", async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: "Bot not found." });
    return;
  }
  const chatId = String(req.body?.chatId ?? "").trim();
  if (!chatId) {
    res.status(400).json({ error: "Chat ID or @username is required." });
    return;
  }
  const outcome = await executeBotMethod(bot, "getChat", { chat_id: chatId });
  if (!outcome.ok || !outcome.result) {
    res.status(400).json({ ok: false, error: outcome.description || "Chat lookup failed." });
    return;
  }
  const c = outcome.result;
  const cType = String(c.type || "private");
  const validType = ["private", "group", "supergroup", "channel"].includes(cType) ? cType : "private";
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
    typeof c.title === "string" ? c.title : null,
    typeof c.username === "string" ? c.username : null,
    typeof c.first_name === "string" ? c.first_name : null,
    typeof c.last_name === "string" ? c.last_name : null
  );
  res.json({ ok: true, chat: c });
});
apiRouter.delete("/bots/:id/chats/:chatId", (req, res) => {
  db.prepare("DELETE FROM bot_chats WHERE bot_id = ? AND chat_id = ?").run(Number(req.params.id), req.params.chatId);
  res.json({ ok: true });
});
apiRouter.get("/bots/:id/commands", (req, res) => {
  const botId = Number(req.params.id);
  const scope = typeof req.query.scope === "string" ? req.query.scope : "default";
  const lang = typeof req.query.lang === "string" ? req.query.lang : "";
  const commands = db.prepare("SELECT * FROM bot_commands WHERE bot_id = ? AND scope_type = ? AND language_code = ? ORDER BY sort_order ASC").all(botId, scope, lang);
  res.json({ commands });
});
apiRouter.post("/bots/:id/commands/sync", async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: "Bot not found." });
    return;
  }
  const scopeType = String(req.body?.scopeType ?? "default");
  const languageCode = String(req.body?.languageCode ?? "").trim().toLowerCase();
  const list = Array.isArray(req.body?.commands) ? req.body.commands : [];
  const cleaned = [];
  for (const item of list) {
    const cmdCheck = validateCommandName(String(item?.command ?? ""));
    if (!cmdCheck.valid) {
      res.status(400).json({ error: cmdCheck.error });
      return;
    }
    const descCheck = validateCommandDescription(String(item?.description ?? ""));
    if (!descCheck.valid) {
      res.status(400).json({ error: `Command /${cmdCheck.normalized}: ${descCheck.error}` });
      return;
    }
    cleaned.push({ command: cmdCheck.normalized, description: String(item.description).trim() });
  }
  const tgParams = {
    commands: cleaned,
    scope: { type: scopeType }
  };
  if (languageCode) tgParams.language_code = languageCode;
  const outcome = await executeBotMethod(bot, cleaned.length > 0 ? "setMyCommands" : "deleteMyCommands", tgParams);
  if (!outcome.ok) {
    res.status(400).json({ ok: false, error: outcome.description || "Failed to sync commands with Telegram." });
    return;
  }
  db.prepare("DELETE FROM bot_commands WHERE bot_id = ? AND scope_type = ? AND language_code = ?").run(
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
    action: "COMMANDS_SYNCED",
    botId: bot.id,
    botName: bot.name,
    status: "success",
    relatedResource: `scope:${scopeType}`,
    details: `Synchronized ${cleaned.length} commands with Telegram.`,
    ipAddress: getClientIp(req)
  });
  res.json({ ok: true, commands: cleaned });
});
apiRouter.post("/bots/:id/commands/pull", async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: "Bot not found." });
    return;
  }
  const scopeType = String(req.body?.scopeType ?? "default");
  const languageCode = String(req.body?.languageCode ?? "").trim().toLowerCase();
  const params = { scope: { type: scopeType } };
  if (languageCode) params.language_code = languageCode;
  const outcome = await executeBotMethod(bot, "getMyCommands", params);
  if (!outcome.ok) {
    res.status(400).json({ ok: false, error: outcome.description || "Failed to pull commands." });
    return;
  }
  res.json({ ok: true, commands: Array.isArray(outcome.result) ? outcome.result : [] });
});
apiRouter.get("/templates", (req, res) => {
  const botId = req.query.botId ? Number(req.query.botId) : null;
  const rows = botId ? db.prepare("SELECT * FROM bot_templates WHERE bot_id = ? OR bot_id IS NULL ORDER BY created_at DESC").all(botId) : db.prepare("SELECT * FROM bot_templates ORDER BY created_at DESC").all();
  res.json({ templates: rows });
});
apiRouter.post("/templates", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const botId = req.body?.botId ? Number(req.body.botId) : null;
  const payload = req.body?.payload;
  if (!name) {
    res.status(400).json({ error: "Template name is required." });
    return;
  }
  const ins = db.prepare(`INSERT INTO bot_templates (bot_id, name, template_type, payload_json) VALUES (?, ?, 'inline_keyboard', ?)`).run(botId, name, JSON.stringify(payload));
  res.status(201).json({ ok: true, id: Number(ins.lastInsertRowid) });
});
apiRouter.delete("/templates/:id", (req, res) => {
  db.prepare("DELETE FROM bot_templates WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});
apiRouter.get("/bots/:id/webhook", async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: "Bot not found." });
    return;
  }
  const info = await executeBotMethod(bot, "getWebhookInfo", {});
  const recentLogs = db.prepare("SELECT * FROM webhook_logs WHERE bot_id = ? ORDER BY created_at DESC LIMIT 20").all(bot.id);
  const baseUrl = getSuggestedWebhookBaseUrl({
    appUrl: process.env.APP_URL,
    vercelProdUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    vercelUrl: process.env.VERCEL_URL,
    host: req.get("host"),
    proto: String(req.headers["x-forwarded-proto"] || req.protocol)
  });
  const suggestedUrl = `${baseUrl}/api/webhook/${bot.bot_key}`;
  res.json({
    bot: sanitizeBotForClient(getBotById(bot.id)),
    webhookInfo: info.result || null,
    suggestedUrl,
    logs: recentLogs
  });
});
apiRouter.post("/bots/:id/webhook", async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: "Bot not found." });
    return;
  }
  const url = String(req.body?.url ?? "").trim();
  const check = validateWebhookUrl(url);
  if (!check.valid) {
    res.status(400).json({ error: check.error });
    return;
  }
  const secretToken = String(req.body?.secretToken ?? "").trim() || generateRandomToken(16);
  const maxConnections = Number(req.body?.maxConnections) || 40;
  const dropPending = Boolean(req.body?.dropPendingUpdates);
  const outcome = await executeBotMethod(bot, "setWebhook", {
    url,
    secret_token: secretToken,
    max_connections: Math.min(100, Math.max(1, maxConnections)),
    drop_pending_updates: dropPending
  });
  if (!outcome.ok) {
    db.prepare(`UPDATE bots SET webhook_status = 'error', last_webhook_error = ? WHERE id = ?`).run(
      outcome.description || "setWebhook failed",
      bot.id
    );
    res.status(400).json({ ok: false, error: outcome.description || "Failed to configure webhook." });
    return;
  }
  db.prepare(`
    UPDATE bots
    SET webhook_url = ?, webhook_status = 'active', webhook_secret_encrypted = ?, last_webhook_error = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(url, encryptToken(secretToken), bot.id);
  logActivity({
    action: "WEBHOOK_CONFIGURED",
    botId: bot.id,
    botName: bot.name,
    status: "success",
    relatedResource: url,
    details: "Set HTTPS webhook with secret token authentication.",
    ipAddress: getClientIp(req)
  });
  res.json({ ok: true, bot: sanitizeBotForClient(getBotById(bot.id)) });
});
apiRouter.delete("/bots/:id/webhook", async (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: "Bot not found." });
    return;
  }
  const outcome = await executeBotMethod(bot, "deleteWebhook", { drop_pending_updates: false });
  if (!outcome.ok) {
    res.status(400).json({ ok: false, error: outcome.description || "Failed to delete webhook." });
    return;
  }
  db.prepare(`UPDATE bots SET webhook_url = NULL, webhook_status = 'inactive', updated_at = datetime('now') WHERE id = ?`).run(
    bot.id
  );
  logActivity({
    action: "WEBHOOK_DELETED",
    botId: bot.id,
    botName: bot.name,
    status: "warning",
    relatedResource: `@${bot.username}`,
    details: "Removed webhook integration.",
    ipAddress: getClientIp(req)
  });
  res.json({ ok: true, bot: sanitizeBotForClient(getBotById(bot.id)) });
});
apiRouter.post("/bots/:id/webhook/simulate", (req, res) => {
  const bot = getBotById(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: "Bot not found." });
    return;
  }
  const updateId = req.body?.updateId ? Number(req.body.updateId) : Math.floor(9e7 + Math.random() * 9999999);
  const updateType = String(req.body?.updateType ?? "message");
  const text = String(req.body?.text ?? "/status");
  const useBadSecret = Boolean(req.body?.useBadSecret);
  const secret = useBadSecret ? "invalid-secret-test" : bot.webhook_secret_encrypted ? decryptToken(bot.webhook_secret_encrypted) : void 0;
  const baseChat = { id: 104829104, first_name: "Sara", username: "sara_lin", type: "private" };
  const payload = { update_id: updateId };
  if (updateType === "callback_query") {
    payload.callback_query = {
      id: `cbq_${Date.now()}`,
      from: { id: 104829104, is_bot: false, first_name: "Sara", username: "sara_lin" },
      message: { message_id: 500, chat: baseChat },
      data: text
    };
  } else {
    payload[updateType] = {
      message_id: Math.floor(1e3 + Math.random() * 5e3),
      from: { id: 104829104, is_bot: false, first_name: "Sara", username: "sara_lin" },
      chat: baseChat,
      date: Math.floor(Date.now() / 1e3),
      text
    };
  }
  const outcome = processIncomingWebhookUpdate({
    bot,
    secretHeader: secret,
    payload
  });
  res.status(outcome.httpStatus).json({ ok: outcome.ok, status: outcome.status, message: outcome.message, updateId });
});
apiRouter.get("/updates", (req, res) => {
  const botId = req.query.botId ? Number(req.query.botId) : null;
  const type = typeof req.query.type === "string" && req.query.type !== "all" ? req.query.type : null;
  const search = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 25;
  const offset = (page - 1) * limit;
  const clauses = [];
  const params = [];
  if (botId) {
    clauses.push("u.bot_id = ?");
    params.push(botId);
  }
  if (type) {
    clauses.push("u.update_type = ?");
    params.push(type);
  }
  if (search) {
    clauses.push('(CAST(u.update_id AS TEXT) LIKE ? OR LOWER(COALESCE(u.summary,"")) LIKE ? OR LOWER(COALESCE(u.sender_username,"")) LIKE ?)');
    const pat = `%${search}%`;
    params.push(pat, pat, pat);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM bot_updates u ${where}`).get(...params).cnt;
  const updates = db.prepare(`
      SELECT u.*, b.name as bot_name, b.username as bot_username
      FROM bot_updates u
      JOIN bots b ON b.id = u.bot_id
      ${where}
      ORDER BY u.received_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
  res.json({ updates, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});
apiRouter.post("/explorer/execute", async (req, res) => {
  const botId = Number(req.body?.botId);
  const method = String(req.body?.method ?? "").trim();
  const params = req.body?.params && typeof req.body.params === "object" ? req.body.params : {};
  const bot = getBotById(botId);
  if (!bot) {
    res.status(404).json({ error: "Select a connected bot first." });
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(method)) {
    res.status(400).json({ error: "Invalid Telegram API method name." });
    return;
  }
  const outcome = await executeBotMethod(bot, method, params);
  logActivity({
    action: "API_EXPLORER_EXEC",
    botId: bot.id,
    botName: bot.name,
    status: outcome.ok ? "success" : "failed",
    relatedResource: method,
    details: `HTTP ${outcome.httpStatus} \xB7 ${outcome.durationMs}ms`,
    ipAddress: getClientIp(req)
  });
  res.json({
    ok: outcome.ok,
    httpStatus: outcome.httpStatus,
    durationMs: outcome.durationMs,
    errorCode: outcome.errorCode,
    description: outcome.description,
    response: outcome.rawResponse
  });
});
apiRouter.get("/explorer/saved", (_req, res) => {
  const saved = db.prepare(`
      SELECT s.*, b.username as bot_username
      FROM saved_api_requests s
      LEFT JOIN bots b ON b.id = s.bot_id
      ORDER BY s.created_at DESC
    `).all();
  res.json({ saved });
});
apiRouter.post("/explorer/saved", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const method = String(req.body?.method ?? "").trim();
  const botId = req.body?.botId ? Number(req.body.botId) : null;
  const params = req.body?.params ?? {};
  if (!name || !method) {
    res.status(400).json({ error: "Request name and method are required." });
    return;
  }
  const ins = db.prepare(`INSERT INTO saved_api_requests (bot_id, name, method, params_json) VALUES (?, ?, ?, ?)`).run(botId, name, method, JSON.stringify(params));
  res.status(201).json({ ok: true, id: Number(ins.lastInsertRowid) });
});
apiRouter.delete("/explorer/saved/:id", (req, res) => {
  db.prepare("DELETE FROM saved_api_requests WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});
apiRouter.get("/debug/logs", (req, res) => {
  const filter = typeof req.query.filter === "string" ? req.query.filter : "all";
  const botId = req.query.botId ? Number(req.query.botId) : null;
  const apiClauses = [];
  const apiParams = [];
  if (botId) {
    apiClauses.push("a.bot_id = ?");
    apiParams.push(botId);
  }
  if (filter === "success") apiClauses.push("a.ok = 1");
  if (filter === "failed" || filter === "api_error") apiClauses.push("a.ok = 0");
  const apiSql = `
    SELECT 'api' as source, a.id, a.bot_id, b.name as bot_name, b.username as bot_username,
           a.method as title, a.http_status, a.telegram_error_code, a.ok, a.duration_ms,
           a.request_payload_json, a.response_payload_json, a.error_message, a.created_at
    FROM api_logs a
    LEFT JOIN bots b ON b.id = a.bot_id
    ${apiClauses.length ? `WHERE ${apiClauses.join(" AND ")}` : ""}
    ORDER BY a.created_at DESC
    LIMIT 60
  `;
  const whClauses = [];
  const whParams = [];
  if (botId) {
    whClauses.push("w.bot_id = ?");
    whParams.push(botId);
  }
  if (filter === "webhook_error") whClauses.push(`w.status IN ('rejected', 'error')`);
  if (filter === "warning") whClauses.push(`w.status = 'duplicate'`);
  if (filter === "success") whClauses.push(`w.status = 'accepted'`);
  const whSql = `
    SELECT 'webhook' as source, w.id, w.bot_id, b.name as bot_name, b.username as bot_username,
           'Webhook #' || COALESCE(CAST(w.update_id AS TEXT), '?') as title, w.http_status,
           NULL as telegram_error_code, CASE WHEN w.status = 'accepted' THEN 1 ELSE 0 END as ok,
           0 as duration_ms, w.payload_preview as request_payload_json,
           w.status as response_payload_json, w.error_message, w.created_at
    FROM webhook_logs w
    LEFT JOIN bots b ON b.id = w.bot_id
    ${whClauses.length ? `WHERE ${whClauses.join(" AND ")}` : ""}
    ORDER BY w.created_at DESC
    LIMIT 40
  `;
  const apiRows = filter === "webhook_error" ? [] : db.prepare(apiSql).all(...apiParams);
  const whRows = filter === "api_error" ? [] : db.prepare(whSql).all(...whParams);
  const merged = [...apiRows, ...whRows].sort(
    (a, b) => String(b.created_at).localeCompare(String(a.created_at))
  );
  res.json({ logs: merged.slice(0, 80) });
});
apiRouter.get("/analytics", (req, res) => {
  const range = typeof req.query.range === "string" ? req.query.range : "14d";
  const botId = req.query.botId ? Number(req.query.botId) : null;
  let daysBack = 14;
  if (range === "today") daysBack = 0;
  else if (range === "yesterday") daysBack = 1;
  else if (range === "7d") daysBack = 7;
  else if (range === "30d") daysBack = 30;
  const startDate = new Date(Date.now() - daysBack * 864e5).toISOString().slice(0, 10);
  const clauses = ["metric_date >= ?"];
  const params = [startDate];
  if (range === "yesterday") {
    clauses.push("metric_date = ?");
    params[0] = startDate;
  }
  if (botId) {
    clauses.push("bot_id = ?");
    params.push(botId);
  }
  const where = `WHERE ${clauses.join(" AND ")}`;
  const summary = db.prepare(`
      SELECT COALESCE(SUM(api_requests), 0) as total_api,
             COALESCE(SUM(api_success), 0) as success_api,
             COALESCE(SUM(api_failed), 0) as failed_api,
             COALESCE(SUM(messages_sent), 0) as messages_sent,
             COALESCE(SUM(updates_received), 0) as updates_received,
             COALESCE(SUM(total_duration_ms), 0) as total_duration_ms
      FROM analytics_daily ${where}
    `).get(...params);
  const timeline = db.prepare(`
      SELECT metric_date as date,
             SUM(api_requests) as api_requests,
             SUM(api_success) as api_success,
             SUM(api_failed) as api_failed,
             SUM(messages_sent) as messages_sent,
             SUM(updates_received) as updates_received
      FROM analytics_daily ${where}
      GROUP BY metric_date
      ORDER BY metric_date ASC
    `).all(...params);
  const byBot = db.prepare(`
      SELECT b.id, b.name, b.username,
             COALESCE(SUM(d.api_requests), 0) as api_requests,
             COALESCE(SUM(d.messages_sent), 0) as messages_sent,
             COALESCE(SUM(d.updates_received), 0) as updates_received
      FROM bots b
      LEFT JOIN analytics_daily d ON d.bot_id = b.id AND d.metric_date >= ?
      GROUP BY b.id
      ORDER BY api_requests DESC
    `).all(startDate);
  const updateDist = db.prepare(`
      SELECT update_type, COUNT(*) as count
      FROM bot_updates
      ${botId ? "WHERE bot_id = ?" : ""}
      GROUP BY update_type
      ORDER BY count DESC
    `).all(...botId ? [botId] : []);
  const uniqueChats = db.prepare(`SELECT COUNT(*) as cnt FROM bot_chats ${botId ? "WHERE bot_id = ?" : ""}`).get(...botId ? [botId] : []).cnt;
  res.json({
    summary: {
      ...summary,
      unique_chats: uniqueChats,
      avg_response_ms: summary.total_api > 0 ? Math.round(summary.total_duration_ms / summary.total_api) : 0,
      success_rate: summary.total_api > 0 ? Math.round(summary.success_api / summary.total_api * 1e3) / 10 : 100
    },
    timeline,
    byBot,
    updateDist
  });
});
apiRouter.get("/analytics/export", (req, res) => {
  const format = req.query.format === "csv" ? "csv" : "json";
  const rows = db.prepare(`
      SELECT d.metric_date, b.username as bot_username, d.messages_sent, d.updates_received, d.api_requests, d.api_success, d.api_failed
      FROM analytics_daily d
      JOIN bots b ON b.id = d.bot_id
      ORDER BY d.metric_date DESC
    `).all();
  if (format === "csv") {
    const header = "date,bot_username,messages_sent,updates_received,api_requests,api_success,api_failed";
    const lines = rows.map(
      (r) => `${r.metric_date},${r.bot_username},${r.messages_sent},${r.updates_received},${r.api_requests},${r.api_success},${r.api_failed}`
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="xc-bot-analytics.csv"');
    res.send([header, ...lines].join("\n"));
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", 'attachment; filename="xc-bot-analytics.json"');
  res.send(JSON.stringify({ exportedAt: (/* @__PURE__ */ new Date()).toISOString(), rows }, null, 2));
});
apiRouter.get("/activity-logs", (req, res) => {
  const search = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const status = typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status : null;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 30;
  const offset = (page - 1) * limit;
  const clauses = [];
  const params = [];
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (search) {
    clauses.push('(LOWER(action) LIKE ? OR LOWER(COALESCE(bot_name,"")) LIKE ? OR LOWER(COALESCE(details,"")) LIKE ?)');
    const pat = `%${search}%`;
    params.push(pat, pat, pat);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM activity_logs ${where}`).get(...params).cnt;
  const logs = db.prepare(`SELECT * FROM activity_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  res.json({ logs, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
});
apiRouter.get("/activity-logs/export", (_req, res) => {
  const rows = db.prepare("SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 500").all();
  const header = "id,action,bot_name,status,related_resource,details,created_at";
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map(
    (r) => [r.id, r.action, r.bot_name, r.status, r.related_resource, r.details, r.created_at].map(escape).join(",")
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="xc-activity-logs.csv"');
  res.send([header, ...lines].join("\n"));
});
apiRouter.get("/notifications", (_req, res) => {
  const items = db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20").all();
  const unread = db.prepare("SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0").get().cnt;
  res.json({ notifications: items, unread });
});
apiRouter.post("/notifications/read-all", (_req, res) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE is_read = 0").run();
  res.json({ ok: true });
});
apiRouter.get("/settings", (_req, res) => {
  res.json({
    app_name: getSetting("app_name", "XC BOT CONTROL"),
    default_theme: getSetting("default_theme", "dark"),
    timezone: getSetting("timezone", "UTC"),
    date_format: getSetting("date_format", "YYYY-MM-DD HH:mm"),
    notify_webhook_errors: getSetting("notify_webhook_errors", "true") === "true",
    notify_failed_api: getSetting("notify_failed_api", "true") === "true"
  });
});
apiRouter.patch("/settings", (req, res) => {
  const allowed = ["app_name", "default_theme", "timezone", "date_format", "notify_webhook_errors", "notify_failed_api"];
  for (const key of allowed) {
    if (req.body?.[key] !== void 0) {
      setSetting(key, String(req.body[key]));
    }
  }
  logActivity({
    action: "SETTINGS_UPDATED",
    status: "success",
    relatedResource: "app_settings",
    details: "Updated console configuration preferences.",
    ipAddress: getClientIp(req)
  });
  res.json({ ok: true });
});
apiRouter.get("/system/health", (req, res) => {
  const dbPath = getDbPath();
  let dbSizeBytes = 0;
  try {
    dbSizeBytes = fs3.statSync(dbPath).size;
  } catch {
    dbSizeBytes = 0;
  }
  const tableCount = db.prepare(`SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).get().cnt;
  const recentErrors = db.prepare(`SELECT method, http_status, error_message, created_at FROM api_logs WHERE ok = 0 ORDER BY created_at DESC LIMIT 5`).all();
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const serverless = isServerlessRuntime();
  res.json({
    runtime: `Node.js ${process.version}`,
    deploymentMode: serverless ? "Vercel Serverless" : "Node.js Server",
    storageMode: serverless ? "Serverless /tmp SQLite + Env Bootstrap" : "Persistent Local SQLite",
    explicitMasterKeyConfigured: hasExplicitMasterKey(),
    databaseEngine: getDbEngineName(),
    databaseConnected: true,
    tableCount,
    dbSizeKb: Math.round(dbSizeBytes / 1024 * 10) / 10,
    httpsActive: proto === "https" || Boolean(process.env.VERCEL),
    webhookEndpointReady: true,
    encryptionAlgorithm: "AES-256-GCM",
    recentErrors
  });
});
apiRouter.get("/backup/export", (req, res) => {
  const bots = db.prepare("SELECT * FROM bots").all().map((b) => sanitizeBotForClient(b));
  const botSettings = db.prepare("SELECT * FROM bot_settings").all();
  const commands = db.prepare("SELECT * FROM bot_commands").all();
  const templates = db.prepare("SELECT * FROM bot_templates").all();
  const chats = db.prepare("SELECT * FROM bot_chats").all();
  const savedRequests = db.prepare("SELECT * FROM saved_api_requests").all();
  const appSettings = db.prepare("SELECT * FROM app_settings").all();
  const data = {
    version: 1,
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    bots,
    botSettings,
    commands,
    templates,
    chats,
    savedRequests,
    appSettings
  };
  const payload = {
    checksum: computeBackupChecksum(data),
    data
  };
  logActivity({
    action: "BACKUP_CREATED",
    status: "success",
    relatedResource: "json_export",
    details: `Exported safe backup (${bots.length} bots, ${templates.length} templates). Tokens omitted for security.`,
    ipAddress: getClientIp(req)
  });
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="xc-bot-control-backup-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});
apiRouter.get("/backup/sql-schema", (_req, res) => {
  const schemaPath = path3.resolve(process.cwd(), "database", "schema.sql");
  if (!fs3.existsSync(schemaPath)) {
    res.status(404).json({ error: "Schema file not found." });
    return;
  }
  res.setHeader("Content-Type", "application/sql");
  res.setHeader("Content-Disposition", 'attachment; filename="xc-bot-control-schema.sql"');
  res.sendFile(schemaPath);
});
apiRouter.post("/backup/restore", (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || !body.checksum || !body.data) {
    res.status(400).json({ error: "Invalid backup structure. Expected { checksum, data }." });
    return;
  }
  const expected = computeBackupChecksum(body.data);
  if (expected !== body.checksum) {
    res.status(400).json({ error: "Backup integrity check failed: SHA-256 checksum mismatch." });
    return;
  }
  const data = body.data;
  let restoredCount = 0;
  if (Array.isArray(data.appSettings)) {
    for (const s of data.appSettings) {
      if (s.setting_key && s.setting_value !== void 0) {
        setSetting(String(s.setting_key), String(s.setting_value));
        restoredCount++;
      }
    }
  }
  if (Array.isArray(data.templates)) {
    for (const t of data.templates) {
      if (t.name && t.payload_json) {
        const exists = db.prepare("SELECT id FROM bot_templates WHERE name = ?").get(t.name);
        if (!exists) {
          db.prepare("INSERT INTO bot_templates (name, template_type, payload_json) VALUES (?, ?, ?)").run(
            String(t.name),
            "inline_keyboard",
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
        const exists = db.prepare("SELECT id FROM saved_api_requests WHERE name = ?").get(r.name);
        if (!exists) {
          db.prepare("INSERT INTO saved_api_requests (name, method, params_json) VALUES (?, ?, ?)").run(
            String(r.name),
            String(r.method),
            String(r.params_json || "{}")
          );
          restoredCount++;
        }
      }
    }
  }
  logActivity({
    action: "BACKUP_RESTORED",
    status: "success",
    relatedResource: "json_restore",
    details: `Verified checksum and restored ${restoredCount} configuration items.`,
    ipAddress: getClientIp(req)
  });
  res.json({ ok: true, restoredCount, message: `Backup verified and restored (${restoredCount} items applied).` });
});

// server/app.ts
var appReadyPromise = null;
async function ensureAppReady() {
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
function createApp() {
  const app2 = express2();
  app2.set("trust proxy", 1);
  app2.use(securityHeaders);
  app2.use(express2.json({ limit: "2mb" }));
  app2.use("/api", async (_req, res, next) => {
    try {
      await ensureAppReady();
      next();
    } catch (err) {
      console.error("[XC BOT CONTROL] Initialization failed:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Server initialization failed."
      });
    }
  });
  app2.use("/api", apiRateLimiter, apiRouter);
  return app2;
}

// api/index.ts
var app = createApp();
function handler(req, res) {
  if (req.url && !req.url.startsWith("/api")) {
    req.url = `/api${req.url === "/" ? "" : req.url}`;
  }
  return app(req, res);
}
export {
  handler as default
};
