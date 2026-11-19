import { db, getSetting, incrementDailyAnalytics, logActivity, pushNotification, setSetting } from './db.js';
import { decryptToken, encryptToken, generateRandomToken, hashTokenFingerprint } from './crypto.js';
import { redactSecrets } from '../src/lib/telegramSpec.js';

export interface BotRecord {
  id: number;
  bot_key: string;
  telegram_bot_id: number;
  name: string;
  username: string;
  short_description: string;
  description: string;
  mode: 'live' | 'sandbox';
  encrypted_token: string;
  token_fingerprint: string;
  token_masked: string;
  connection_status: 'connected' | 'disconnected' | 'invalid_token' | 'webhook_error' | 'api_error';
  webhook_status: 'active' | 'inactive' | 'error';
  webhook_url: string | null;
  webhook_secret_encrypted: string | null;
  pending_update_count: number;
  last_webhook_error: string | null;
  can_join_groups: number;
  can_read_all_group_messages: number;
  supports_inline_queries: number;
  last_checked_at: string | null;
  last_activity_at: string | null;
}

export interface TelegramCallResult {
  ok: boolean;
  httpStatus: number;
  durationMs: number;
  result?: unknown;
  errorCode?: number;
  description?: string;
  rawResponse: Record<string, unknown>;
}

/**
 * Validates a raw Telegram Bot Token via real Telegram getMe (or Sandbox preview).
 */
export async function validateTokenWithTelegram(
  rawToken: string,
  mode: 'live' | 'sandbox'
): Promise<{
  ok: boolean;
  profile?: {
    id: number;
    first_name: string;
    username: string;
    can_join_groups: boolean;
    can_read_all_group_messages: boolean;
    supports_inline_queries: boolean;
  };
  error?: string;
}> {
  if (mode === 'sandbox') {
    const slug = rawToken.trim().replace(/^sandbox:/, '');
    const cleanName = slug
      .split(/[_-]+/)
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');
    const username = slug.toLowerCase().endsWith('_bot') ? slug.toLowerCase() : `${slug.toLowerCase()}_bot`;
    // Deterministic numeric ID from slug
    let hash = 7000000000;
    for (let i = 0; i < slug.length; i++) {
      hash += slug.charCodeAt(i) * (i + 17) * 131;
    }
    return {
      ok: true,
      profile: {
        id: hash,
        first_name: cleanName || 'XC Sandbox Bot',
        username,
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: true,
      },
    };
  }

  // Live Telegram API call
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const resp = await fetch(`https://api.telegram.org/bot${rawToken.trim()}/getMe`, {
      method: 'GET',
      signal: controller.signal,
    });
    const json = (await resp.json()) as {
      ok: boolean;
      result?: {
        id: number;
        first_name: string;
        username: string;
        can_join_groups?: boolean;
        can_read_all_group_messages?: boolean;
        supports_inline_queries?: boolean;
      };
      description?: string;
    };
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
        supports_inline_queries: Boolean(json.result.supports_inline_queries),
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `Network error calling Telegram API: ${err.message}` : 'Failed to reach Telegram API.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Executes a Telegram Bot API method for a connected bot (live HTTPS call or sandbox engine),
 * records api_logs with secret redaction, and updates analytics_daily.
 */
export async function executeBotMethod(
  bot: BotRecord,
  method: string,
  params: Record<string, unknown> = {}
): Promise<TelegramCallResult> {
  const startedAt = Date.now();
  let result: TelegramCallResult;

  if (bot.mode === 'live') {
    const token = decryptToken(bot.encrypted_token);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const url = `https://api.telegram.org/bot${token}/${method}`;
      const hasBody = Object.keys(params).length > 0;
      const resp = await fetch(url, {
        method: hasBody ? 'POST' : 'GET',
        headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
        body: hasBody ? JSON.stringify(params) : undefined,
        signal: controller.signal,
      });
      const json = (await resp.json()) as Record<string, unknown>;
      const durationMs = Math.max(1, Date.now() - startedAt);
      const ok = Boolean(json.ok);
      result = {
        ok,
        httpStatus: resp.status,
        durationMs,
        result: json.result,
        errorCode: typeof json.error_code === 'number' ? json.error_code : undefined,
        description: typeof json.description === 'string' ? json.description : undefined,
        rawResponse: json,
      };
    } catch (err) {
      const durationMs = Math.max(1, Date.now() - startedAt);
      const msg = err instanceof Error ? err.message : 'Telegram request failed';
      result = {
        ok: false,
        httpStatus: 502,
        durationMs,
        errorCode: 502,
        description: msg,
        rawResponse: { ok: false, error_code: 502, description: msg },
      };
    } finally {
      clearTimeout(timeout);
    }
  } else {
    result = executeSandboxMethod(bot, method, params, startedAt);
  }

  // Persist sanitized API log
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
    result.ok ? null : result.description ?? 'Unknown API error'
  );

  // Update bot status & last activity
  const nextConnStatus = result.ok
    ? 'connected'
    : result.errorCode === 401
    ? 'invalid_token'
    : 'api_error';

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
    durationMs: result.durationMs,
  });

  if (!result.ok) {
    pushNotification({
      botId: bot.id,
      severity: 'error',
      title: `API Error on @${bot.username}`,
      message: `${method} failed (${result.errorCode || result.httpStatus}): ${result.description || 'Unknown error'}`,
    });
  }

  return result;
}

/**
 * Uploads a JPEG profile photo for a connected bot using Telegram's multipart/form-data
 * setMyProfilePhoto (InputProfilePhotoStatic) or sandbox equivalent.
 */
export async function setBotProfilePhoto(bot: BotRecord, jpegBuffer: Buffer): Promise<TelegramCallResult> {
  const startedAt = Date.now();
  let result: TelegramCallResult;

  if (!jpegBuffer || jpegBuffer.length === 0) {
    return {
      ok: false,
      httpStatus: 400,
      durationMs: 1,
      errorCode: 400,
      description: 'Profile photo image buffer cannot be empty.',
      rawResponse: { ok: false, error_code: 400, description: 'Profile photo image buffer cannot be empty.' },
    };
  }

  if (bot.mode === 'live') {
    const token = decryptToken(bot.encrypted_token);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const form = new FormData();
      form.append('photo', JSON.stringify({ type: 'static', photo: 'attach://photo_file' }));
      form.append('photo_file', new Blob([new Uint8Array(jpegBuffer)], { type: 'image/jpeg' }), 'profile.jpg');

      const resp = await fetch(`https://api.telegram.org/bot${token}/setMyProfilePhoto`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      const json = (await resp.json()) as Record<string, unknown>;
      const durationMs = Math.max(1, Date.now() - startedAt);
      result = {
        ok: Boolean(json.ok),
        httpStatus: resp.status,
        durationMs,
        result: json.result,
        errorCode: typeof json.error_code === 'number' ? json.error_code : undefined,
        description: typeof json.description === 'string' ? json.description : undefined,
        rawResponse: json,
      };
    } catch (err) {
      const durationMs = Math.max(1, Date.now() - startedAt);
      const msg = err instanceof Error ? err.message : 'Telegram setMyProfilePhoto request failed';
      result = {
        ok: false,
        httpStatus: 502,
        durationMs,
        errorCode: 502,
        description: msg,
        rawResponse: { ok: false, error_code: 502, description: msg },
      };
    } finally {
      clearTimeout(timeout);
    }
  } else {
    const durationMs = Math.max(12, Date.now() - startedAt + 18);
    result = {
      ok: true,
      httpStatus: 200,
      durationMs,
      result: true,
      rawResponse: { ok: true, result: true },
    };
  }

  const safeReq = JSON.stringify({ type: 'static', bytes: jpegBuffer.length });
  const safeRes = redactSecrets(JSON.stringify(result.rawResponse));

  db.prepare(`
    INSERT INTO api_logs (
      bot_id, method, http_status, telegram_error_code, ok, duration_ms,
      request_payload_json, response_payload_json, error_message
    ) VALUES (?, 'setMyProfilePhoto', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    bot.id,
    result.httpStatus,
    result.errorCode ?? null,
    result.ok ? 1 : 0,
    result.durationMs,
    safeReq,
    safeRes,
    result.ok ? null : result.description ?? 'Unknown API error'
  );

  incrementDailyAnalytics({
    botId: bot.id,
    apiRequests: 1,
    apiSuccess: result.ok ? 1 : 0,
    apiFailed: result.ok ? 0 : 1,
    durationMs: result.durationMs,
  });

  if (!result.ok) {
    pushNotification({
      botId: bot.id,
      severity: 'error',
      title: `Photo Update Failed on @${bot.username}`,
      message: `setMyProfilePhoto failed (${result.errorCode || result.httpStatus}): ${result.description || 'Unknown error'}`,
    });
  }

  return result;
}

/**
 * Executes setWebhook, getWebhookInfo, or deleteWebhook directly using a supplied Bot Token
 * without requiring the bot to be pre-registered in the fleet.
 */
export async function executeDirectWebhookMethod(params: {
  token: string;
  mode: 'live' | 'sandbox';
  method: 'setWebhook' | 'getWebhookInfo' | 'deleteWebhook';
  body?: Record<string, unknown>;
}): Promise<TelegramCallResult> {
  const { token, mode, method, body = {} } = params;
  const startedAt = Date.now();
  let result: TelegramCallResult;

  if (mode === 'live') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const url = `https://api.telegram.org/bot${token.trim()}/${method}`;
      const hasBody = Object.keys(body).length > 0;
      const resp = await fetch(url, {
        method: hasBody ? 'POST' : 'GET',
        headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
        body: hasBody ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const json = (await resp.json()) as Record<string, unknown>;
      const durationMs = Math.max(1, Date.now() - startedAt);
      result = {
        ok: Boolean(json.ok),
        httpStatus: resp.status,
        durationMs,
        result: json.result,
        errorCode: typeof json.error_code === 'number' ? json.error_code : undefined,
        description: typeof json.description === 'string' ? json.description : undefined,
        rawResponse: json,
      };
    } catch (err) {
      const durationMs = Math.max(1, Date.now() - startedAt);
      const msg = err instanceof Error ? err.message : 'Telegram request failed';
      result = {
        ok: false,
        httpStatus: 502,
        durationMs,
        errorCode: 502,
        description: msg,
        rawResponse: { ok: false, error_code: 502, description: msg },
      };
    } finally {
      clearTimeout(timeout);
    }
  } else {
    const key = `direct_webhook_${hashTokenFingerprint(token.trim())}`;
    const durationMs = 18;
    if (method === 'setWebhook') {
      const url = String(body.url ?? '').trim();
      if (!url.startsWith('https://')) {
        result = {
          ok: false,
          httpStatus: 400,
          durationMs,
          errorCode: 400,
          description: 'Bad Request: bad webhook: HTTPS url must be provided for webhook',
          rawResponse: {
            ok: false,
            error_code: 400,
            description: 'Bad Request: bad webhook: HTTPS url must be provided for webhook',
          },
        };
      } else {
        setSetting(
          key,
          JSON.stringify({
            url,
            has_custom_certificate: false,
            pending_update_count: 0,
            max_connections: Number(body.max_connections) || 40,
            ip_address: '149.154.167.220',
          })
        );
        result = { ok: true, httpStatus: 200, durationMs, result: true, rawResponse: { ok: true, result: true } };
      }
    } else if (method === 'deleteWebhook') {
      db.prepare('DELETE FROM app_settings WHERE setting_key = ?').run(key);
      result = { ok: true, httpStatus: 200, durationMs, result: true, rawResponse: { ok: true, result: true } };
    } else {
      const rawStored = getSetting(key, '');
      let info: Record<string, unknown> = {
        url: '',
        has_custom_certificate: false,
        pending_update_count: 0,
      };
      if (rawStored) {
        try {
          info = JSON.parse(rawStored) as Record<string, unknown>;
        } catch {
          // ignore malformed entry
        }
      }
      result = { ok: true, httpStatus: 200, durationMs, result: info, rawResponse: { ok: true, result: info } };
    }
  }

  db.prepare(`
    INSERT INTO api_logs (
      bot_id, method, http_status, telegram_error_code, ok, duration_ms,
      request_payload_json, response_payload_json, error_message
    ) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    method,
    result.httpStatus,
    result.errorCode ?? null,
    result.ok ? 1 : 0,
    result.durationMs,
    redactSecrets(JSON.stringify(body)),
    redactSecrets(JSON.stringify(result.rawResponse)),
    result.ok ? null : result.description ?? 'Unknown API error'
  );

  return result;
}

function executeSandboxMethod(
  bot: BotRecord,
  method: string,
  params: Record<string, unknown>,
  startedAt: number
): TelegramCallResult {
  const durationMs = Math.max(12, Date.now() - startedAt + 18);

  const fail = (code: number, description: string): TelegramCallResult => ({
    ok: false,
    httpStatus: code,
    durationMs,
    errorCode: code,
    description,
    rawResponse: { ok: false, error_code: code, description },
  });

  const succeed = (res: unknown): TelegramCallResult => ({
    ok: true,
    httpStatus: 200,
    durationMs,
    result: res,
    rawResponse: { ok: true, result: res },
  });

  switch (method) {
    case 'getMe':
      return succeed({
        id: bot.telegram_bot_id,
        is_bot: true,
        first_name: bot.name,
        username: bot.username,
        can_join_groups: Boolean(bot.can_join_groups),
        can_read_all_group_messages: Boolean(bot.can_read_all_group_messages),
        supports_inline_queries: Boolean(bot.supports_inline_queries),
      });

    case 'getMyName':
      return succeed({ name: bot.name });

    case 'getMyDescription':
      return succeed({ description: bot.description || '' });

    case 'getMyShortDescription':
      return succeed({ short_description: bot.short_description || '' });

    case 'setMyName': {
      const nextName = String(params.name ?? '').trim();
      if (nextName.length > 64) {
        return fail(400, 'Bad Request: BOT_NAME_INVALID (max 64 characters)');
      }
      if (nextName) {
        db.prepare(`UPDATE bots SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(nextName, bot.id);
      }
      return succeed(true);
    }

    case 'setMyShortDescription': {
      const nextShort = String(params.short_description ?? '').trim();
      if (nextShort.length > 120) {
        return fail(400, 'Bad Request: BOT_SHORT_DESCRIPTION_TOO_LONG (max 120 characters)');
      }
      db.prepare(`UPDATE bots SET short_description = ?, updated_at = datetime('now') WHERE id = ?`).run(nextShort, bot.id);
      return succeed(true);
    }

    case 'setMyDescription': {
      const nextDesc = String(params.description ?? '').trim();
      if (nextDesc.length > 512) {
        return fail(400, 'Bad Request: BOT_DESCRIPTION_TOO_LONG (max 512 characters)');
      }
      db.prepare(`UPDATE bots SET description = ?, updated_at = datetime('now') WHERE id = ?`).run(nextDesc, bot.id);
      return succeed(true);
    }

    case 'setMyProfilePhoto':
      return succeed(true);

    case 'removeMyProfilePhoto':
      db.prepare('DELETE FROM app_settings WHERE setting_key = ?').run(`bot_avatar_${bot.id}`);
      return succeed(true);

    case 'sendMessage':
    case 'sendPhoto':
    case 'sendVideo':
    case 'sendDocument':
    case 'sendAudio':
    case 'sendAnimation':
    case 'sendVoice':
    case 'sendLocation':
    case 'sendContact':
    case 'sendPoll':
    case 'sendMediaGroup': {
      const chatId = String(params.chat_id ?? '').trim();
      if (!chatId) {
        return fail(400, 'Bad Request: chat_id is empty');
      }
      if (method === 'sendMessage' && !String(params.text ?? '').trim()) {
        return fail(400, 'Bad Request: message text is empty');
      }
      if (chatId === 'invalid_chat' || chatId === '0') {
        return fail(400, 'Bad Request: chat not found');
      }
      const messageId = Math.floor(1000 + Math.random() * 89000);
      const chatRow = db
        .prepare('SELECT * FROM bot_chats WHERE bot_id = ? AND chat_id = ?')
        .get(bot.id, chatId) as Record<string, unknown> | undefined;

      const chatObj = chatRow
        ? {
            id: chatRow.chat_id,
            type: chatRow.chat_type,
            title: chatRow.title || undefined,
            username: chatRow.username || undefined,
            first_name: chatRow.first_name || undefined,
          }
        : { id: chatId, type: chatId.startsWith('-100') ? 'supergroup' : chatId.startsWith('@') ? 'channel' : 'private' };

      return succeed({
        message_id: messageId,
        from: { id: bot.telegram_bot_id, is_bot: true, first_name: bot.name, username: bot.username },
        chat: chatObj,
        date: Math.floor(Date.now() / 1000),
        text: params.text || params.caption || params.question || `[${method}]`,
        reply_markup: params.reply_markup || undefined,
      });
    }

    case 'getWebhookInfo':
      return succeed({
        url: bot.webhook_url || '',
        has_custom_certificate: false,
        pending_update_count: bot.pending_update_count || 0,
        last_error_message: bot.last_webhook_error || undefined,
        max_connections: 40,
        ip_address: '149.154.167.220',
      });

    case 'setWebhook': {
      const url = String(params.url ?? '').trim();
      if (!url.startsWith('https://')) {
        return fail(400, 'Bad Request: bad webhook: HTTPS url must be provided for webhook');
      }
      const secret = typeof params.secret_token === 'string' && params.secret_token ? params.secret_token : generateRandomToken(16);
      db.prepare(`
        UPDATE bots
        SET webhook_url = ?, webhook_status = 'active', webhook_secret_encrypted = ?, last_webhook_error = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(url, encryptToken(secret), bot.id);
      return succeed(true);
    }

    case 'deleteWebhook':
      db.prepare(`
        UPDATE bots
        SET webhook_url = NULL, webhook_status = 'inactive', pending_update_count = 0, updated_at = datetime('now')
        WHERE id = ?
      `).run(bot.id);
      return succeed(true);

    case 'getUpdates': {
      if (bot.webhook_status === 'active' && bot.webhook_url) {
        return fail(409, "Conflict: can't use getUpdates method while webhook is active; use deleteWebhook to delete the webhook first");
      }
      const rows = db
        .prepare('SELECT raw_json FROM bot_updates WHERE bot_id = ? ORDER BY update_id DESC LIMIT 20')
        .all(bot.id) as { raw_json: string }[];
      return succeed(rows.map((r) => JSON.parse(r.raw_json)));
    }

    case 'getMyCommands': {
      const rows = db
        .prepare('SELECT command, description FROM bot_commands WHERE bot_id = ? ORDER BY sort_order ASC')
        .all(bot.id) as { command: string; description: string }[];
      return succeed(rows);
    }

    case 'setMyCommands': {
      if (!Array.isArray(params.commands)) {
        return fail(400, 'Bad Request: commands must be an array');
      }
      return succeed(true);
    }

    case 'deleteMyCommands':
      return succeed(true);

    case 'getChat': {
      const chatId = String(params.chat_id ?? '').trim();
      if (!chatId) return fail(400, 'Bad Request: chat_id is required');
      const row = db
        .prepare('SELECT * FROM bot_chats WHERE bot_id = ? AND chat_id = ?')
        .get(bot.id, chatId) as Record<string, unknown> | undefined;
      if (!row) {
        return fail(400, 'Bad Request: chat not found');
      }
      return succeed({
        id: row.chat_id,
        type: row.chat_type,
        title: row.title || undefined,
        username: row.username || undefined,
        first_name: row.first_name || undefined,
        last_name: row.last_name || undefined,
      });
    }

    case 'getChatAdministrators': {
      const chatId = String(params.chat_id ?? '').trim();
      if (!chatId) return fail(400, 'Bad Request: chat_id is required');
      return succeed([
        {
          status: 'creator',
          user: { id: 104829104, is_bot: false, first_name: 'Sara', username: 'sara_lin' },
        },
        {
          status: 'administrator',
          user: { id: bot.telegram_bot_id, is_bot: true, first_name: bot.name, username: bot.username },
          can_manage_chat: true,
          can_delete_messages: true,
        },
      ]);
    }

    case 'getChatMember':
      return succeed({
        status: 'member',
        user: { id: Number(params.user_id) || 104829104, is_bot: false, first_name: 'Member' },
      });

    case 'banChatMember':
    case 'unbanChatMember':
    case 'restrictChatMember':
    case 'promoteChatMember':
      if (!params.chat_id || !params.user_id) {
        return fail(400, 'Bad Request: chat_id and user_id are required');
      }
      return succeed(true);

    default:
      return fail(404, `Not Found: unsupported method ${method}`);
  }
}

/**
 * Processes an incoming Telegram webhook update payload with strict secret verification and duplicate update_id prevention.
 */
export function processIncomingWebhookUpdate(params: {
  bot: BotRecord;
  secretHeader: string | undefined;
  payload: Record<string, unknown>;
}): { httpStatus: number; ok: boolean; status: 'accepted' | 'duplicate' | 'rejected' | 'error'; message: string } {
  const { bot, secretHeader, payload } = params;

  // Verify configured secret token
  if (bot.webhook_secret_encrypted) {
    const expectedSecret = decryptToken(bot.webhook_secret_encrypted);
    if (!secretHeader || secretHeader !== expectedSecret) {
      db.prepare(`
        INSERT INTO webhook_logs (bot_id, update_id, http_status, secret_verified, status, error_message, payload_preview)
        VALUES (?, ?, 401, 0, 'rejected', 'Invalid X-Telegram-Bot-Api-Secret-Token header', ?)
      `).run(bot.id, typeof payload.update_id === 'number' ? payload.update_id : null, redactSecrets(JSON.stringify(payload).slice(0, 240)));

      return { httpStatus: 401, ok: false, status: 'rejected', message: 'Webhook secret token verification failed.' };
    }
  }

  const updateId = payload.update_id;
  if (typeof updateId !== 'number' || !Number.isInteger(updateId)) {
    db.prepare(`
      INSERT INTO webhook_logs (bot_id, update_id, http_status, secret_verified, status, error_message, payload_preview)
      VALUES (?, NULL, 400, 1, 'error', 'Missing numeric update_id', ?)
    `).run(bot.id, redactSecrets(JSON.stringify(payload).slice(0, 240)));

    return { httpStatus: 400, ok: false, status: 'error', message: 'Invalid Telegram Update: numeric update_id required.' };
  }

  // Determine update category & metadata
  const updateKeys = [
    'message',
    'edited_message',
    'channel_post',
    'edited_channel_post',
    'callback_query',
    'inline_query',
    'chosen_inline_result',
    'my_chat_member',
    'chat_member',
    'chat_join_request',
  ];
  const updateType = updateKeys.find((k) => payload[k] && typeof payload[k] === 'object') || 'other';
  const inner = (payload[updateType] as Record<string, unknown>) || {};
  const chatObj =
    (inner.chat as Record<string, unknown>) ||
    ((inner.message as Record<string, unknown> | undefined)?.chat as Record<string, unknown>) ||
    undefined;
  const fromObj = (inner.from as Record<string, unknown>) || undefined;

  const chatId = chatObj?.id !== undefined ? String(chatObj.id) : null;
  const senderUsername = typeof fromObj?.username === 'string' ? fromObj.username : null;
  const summary =
    typeof inner.text === 'string'
      ? inner.text.slice(0, 140)
      : typeof inner.data === 'string'
      ? `Callback: ${inner.data}`
      : typeof inner.query === 'string'
      ? `Inline: ${inner.query}`
      : `${updateType} #${updateId}`;

  const safeRaw = redactSecrets(JSON.stringify(payload));

  try {
    db.prepare(`
      INSERT INTO bot_updates (bot_id, update_id, update_type, chat_id, sender_username, summary, processing_status, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, 'processed', ?)
    `).run(bot.id, updateId, updateType, chatId, senderUsername, summary, safeRaw);
  } catch (err) {
    // UNIQUE(bot_id, update_id) violation -> duplicate update prevented
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('UNIQUE')) {
      db.prepare(`
        INSERT INTO webhook_logs (bot_id, update_id, http_status, secret_verified, status, error_message, payload_preview)
        VALUES (?, ?, 200, 1, 'duplicate', 'Duplicate update_id ignored by idempotency constraint', ?)
      `).run(bot.id, updateId, summary);

      return {
        httpStatus: 200,
        ok: true,
        status: 'duplicate',
        message: `Update #${updateId} already processed (duplicate prevented).`,
      };
    }
    throw err;
  }

  // Upsert known chat if present
  if (chatObj && chatObj.id !== undefined) {
    const cType = String(chatObj.type || 'private');
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
      String(chatObj.id),
      validType,
      typeof chatObj.title === 'string' ? chatObj.title : null,
      typeof chatObj.username === 'string' ? chatObj.username : null,
      typeof chatObj.first_name === 'string' ? chatObj.first_name : null,
      typeof chatObj.last_name === 'string' ? chatObj.last_name : null
    );
  }

  db.prepare(`
    INSERT INTO webhook_logs (bot_id, update_id, http_status, secret_verified, status, payload_preview)
    VALUES (?, ?, 200, 1, 'accepted', ?)
  `).run(bot.id, updateId, summary);

  db.prepare(`UPDATE bots SET last_activity_at = datetime('now') WHERE id = ?`).run(bot.id);

  incrementDailyAnalytics({ botId: bot.id, updatesReceived: 1 });

  logActivity({
    action: 'WEBHOOK_UPDATE_RECEIVED',
    botId: bot.id,
    botName: bot.name,
    status: 'success',
    relatedResource: `update:${updateId}`,
    details: `${updateType} · ${summary}`,
  });

  return {
    httpStatus: 200,
    ok: true,
    status: 'accepted',
    message: `Update #${updateId} (${updateType}) verified and stored.`,
  };
}
