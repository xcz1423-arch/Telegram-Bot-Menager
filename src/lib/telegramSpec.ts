export type ApiCategoryId =
  | 'bot_info'
  | 'messaging'
  | 'updates'
  | 'webhook'
  | 'commands'
  | 'chat_info'
  | 'chat_admin';

export interface ApiParamDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  required?: boolean;
  description: string;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  enumValues?: string[];
}

export interface ApiMethodDef {
  method: string;
  category: ApiCategoryId;
  summary: string;
  httpMethod: 'POST' | 'GET';
  params: ApiParamDef[];
}

export interface InlineButtonDef {
  id: string;
  text: string;
  type: 'callback_data' | 'url' | 'web_app' | 'login_url';
  value: string;
}

export const API_CATEGORIES: { id: ApiCategoryId; label: string }[] = [
  { id: 'bot_info', label: 'Bot Information' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'updates', label: 'Update Management' },
  { id: 'webhook', label: 'Webhook' },
  { id: 'commands', label: 'Commands' },
  { id: 'chat_info', label: 'Chat Information' },
  { id: 'chat_admin', label: 'Chat Administration' },
];

export const TELEGRAM_API_METHODS: ApiMethodDef[] = [
  // A. Bot Information
  {
    method: 'getMe',
    category: 'bot_info',
    summary: 'Returns basic information about the bot in form of a User object.',
    httpMethod: 'GET',
    params: [],
  },
  {
    method: 'getMyName',
    category: 'bot_info',
    summary: 'Get the current bot name for the given user language.',
    httpMethod: 'POST',
    params: [
      { name: 'language_code', type: 'string', description: 'Two-letter ISO 639-1 language code', placeholder: 'en' },
    ],
  },
  {
    method: 'getMyDescription',
    category: 'bot_info',
    summary: 'Get the current bot description for the given user language.',
    httpMethod: 'POST',
    params: [
      { name: 'language_code', type: 'string', description: 'Two-letter ISO 639-1 language code', placeholder: 'en' },
    ],
  },
  {
    method: 'getMyShortDescription',
    category: 'bot_info',
    summary: 'Get the current bot short description for the given user language.',
    httpMethod: 'POST',
    params: [
      { name: 'language_code', type: 'string', description: 'Two-letter ISO 639-1 language code', placeholder: 'en' },
    ],
  },
  {
    method: 'setMyName',
    category: 'bot_info',
    summary: "Change the bot's name shown on Telegram (0-64 characters).",
    httpMethod: 'POST',
    params: [
      { name: 'name', type: 'string', description: 'New bot name (0-64 characters)', placeholder: 'XC Bot' },
      { name: 'language_code', type: 'string', description: 'Two-letter ISO 639-1 language code', placeholder: 'en' },
    ],
  },
  {
    method: 'setMyShortDescription',
    category: 'bot_info',
    summary: "Change the bot's bio / short description on its profile page (0-120 characters).",
    httpMethod: 'POST',
    params: [
      { name: 'short_description', type: 'string', description: 'New short description / bio (0-120 characters)', placeholder: 'Automated Telegram assistant' },
      { name: 'language_code', type: 'string', description: 'Two-letter ISO 639-1 language code', placeholder: 'en' },
    ],
  },
  {
    method: 'setMyDescription',
    category: 'bot_info',
    summary: "Change the bot's description shown in empty chats before /start (0-512 characters).",
    httpMethod: 'POST',
    params: [
      { name: 'description', type: 'string', description: 'New bot description (0-512 characters)', placeholder: 'What can this bot do?' },
      { name: 'language_code', type: 'string', description: 'Two-letter ISO 639-1 language code', placeholder: 'en' },
    ],
  },
  {
    method: 'setMyProfilePhoto',
    category: 'bot_info',
    summary: 'Change the profile photo of the bot (InputProfilePhotoStatic JPEG upload).',
    httpMethod: 'POST',
    params: [
      { name: 'photo', type: 'json', required: true, description: 'InputProfilePhoto object describing the new profile photo', placeholder: '{"type":"static","photo":"attach://photo_file"}' },
    ],
  },
  {
    method: 'removeMyProfilePhoto',
    category: 'bot_info',
    summary: 'Remove the current profile photo of the bot.',
    httpMethod: 'POST',
    params: [],
  },
  // B. Messaging
  {
    method: 'sendMessage',
    category: 'messaging',
    summary: 'Send text messages with optional formatting and reply markup.',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Unique identifier for target chat or @username', placeholder: '104829104' },
      { name: 'text', type: 'string', required: true, description: 'Text of the message to be sent (1-4096 chars)', placeholder: 'Hello from XC BOT CONTROL' },
      { name: 'parse_mode', type: 'string', description: 'Mode for parsing entities', enumValues: ['', 'HTML', 'MarkdownV2', 'Markdown'] },
      { name: 'disable_notification', type: 'boolean', description: 'Sends the message silently', defaultValue: false },
      { name: 'protect_content', type: 'boolean', description: 'Protects contents from forwarding and saving', defaultValue: false },
      { name: 'reply_markup', type: 'json', description: 'JSON-serialized InlineKeyboardMarkup or ReplyKeyboardMarkup', placeholder: '{"inline_keyboard":[[{"text":"Open","url":"https://t.me"}]]}' },
    ],
  },
  {
    method: 'sendPhoto',
    category: 'messaging',
    summary: 'Send photos by URL or file_id with optional caption.',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Target chat ID or @channelusername', placeholder: '104829104' },
      { name: 'photo', type: 'string', required: true, description: 'Photo URL or Telegram file_id', placeholder: 'https://example.com/banner.jpg' },
      { name: 'caption', type: 'string', description: 'Photo caption (0-1024 chars)', placeholder: 'Release v2.4 snapshot' },
      { name: 'parse_mode', type: 'string', description: 'Caption parse mode', enumValues: ['', 'HTML', 'MarkdownV2'] },
    ],
  },
  {
    method: 'sendVideo',
    category: 'messaging',
    summary: 'Send video files by URL or file_id.',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Target chat ID', placeholder: '104829104' },
      { name: 'video', type: 'string', required: true, description: 'Video URL or file_id', placeholder: 'https://example.com/clip.mp4' },
      { name: 'caption', type: 'string', description: 'Video caption' },
    ],
  },
  {
    method: 'sendDocument',
    category: 'messaging',
    summary: 'Send general files by URL or file_id.',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Target chat ID', placeholder: '104829104' },
      { name: 'document', type: 'string', required: true, description: 'File URL or file_id', placeholder: 'https://example.com/report.pdf' },
      { name: 'caption', type: 'string', description: 'Document caption' },
    ],
  },
  {
    method: 'sendAudio',
    category: 'messaging',
    summary: 'Send audio files (.mp3 or .m4a).',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Target chat ID', placeholder: '104829104' },
      { name: 'audio', type: 'string', required: true, description: 'Audio URL or file_id', placeholder: 'https://example.com/track.mp3' },
      { name: 'caption', type: 'string', description: 'Audio caption' },
    ],
  },
  {
    method: 'sendAnimation',
    category: 'messaging',
    summary: 'Send animation files (GIF or H.264/MPEG-4 AVC video without sound).',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Target chat ID', placeholder: '104829104' },
      { name: 'animation', type: 'string', required: true, description: 'Animation URL or file_id', placeholder: 'https://example.com/anim.gif' },
      { name: 'caption', type: 'string', description: 'Animation caption' },
    ],
  },
  {
    method: 'sendVoice',
    category: 'messaging',
    summary: 'Send .ogg voice messages encoded with OPUS.',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Target chat ID', placeholder: '104829104' },
      { name: 'voice', type: 'string', required: true, description: 'Voice URL or file_id', placeholder: 'https://example.com/note.ogg' },
      { name: 'caption', type: 'string', description: 'Voice caption' },
    ],
  },
  {
    method: 'sendLocation',
    category: 'messaging',
    summary: 'Send point on the map.',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Target chat ID', placeholder: '104829104' },
      { name: 'latitude', type: 'number', required: true, description: 'Latitude of the location', placeholder: '37.7749' },
      { name: 'longitude', type: 'number', required: true, description: 'Longitude of the location', placeholder: '-122.4194' },
    ],
  },
  {
    method: 'sendContact',
    category: 'messaging',
    summary: 'Send phone contacts.',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Target chat ID', placeholder: '104829104' },
      { name: 'phone_number', type: 'string', required: true, description: "Contact's phone number", placeholder: '+14155550199' },
      { name: 'first_name', type: 'string', required: true, description: "Contact's first name", placeholder: 'Alex' },
      { name: 'last_name', type: 'string', description: "Contact's last name", placeholder: 'Mercer' },
    ],
  },
  {
    method: 'sendPoll',
    category: 'messaging',
    summary: 'Send a native poll with 2-10 answer options.',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Target chat ID', placeholder: '-100192837465' },
      { name: 'question', type: 'string', required: true, description: 'Poll question (1-300 chars)', placeholder: 'Deploy v3 tonight?' },
      { name: 'options', type: 'json', required: true, description: 'JSON array of 2-10 option strings or InputPollOption objects', placeholder: '["Ship it","Wait for QA"]' },
      { name: 'is_anonymous', type: 'boolean', description: 'True if poll needs to be anonymous', defaultValue: true },
    ],
  },
  {
    method: 'sendMediaGroup',
    category: 'messaging',
    summary: 'Send a group of photos, videos, documents or audios as an album.',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Target chat ID', placeholder: '104829104' },
      { name: 'media', type: 'json', required: true, description: 'JSON array of 2-10 InputMedia objects', placeholder: '[{"type":"photo","media":"https://example.com/1.jpg"},{"type":"photo","media":"https://example.com/2.jpg"}]' },
    ],
  },
  // C. Update Management
  {
    method: 'getUpdates',
    category: 'updates',
    summary: 'Receive incoming updates using long polling (disabled while webhook is active).',
    httpMethod: 'POST',
    params: [
      { name: 'offset', type: 'number', description: 'Identifier of the first update to be returned', placeholder: '0' },
      { name: 'limit', type: 'number', description: 'Limits the number of updates to be retrieved (1-100)', defaultValue: 20 },
      { name: 'timeout', type: 'number', description: 'Timeout in seconds for long polling', defaultValue: 0 },
    ],
  },
  // D. Webhook
  {
    method: 'getWebhookInfo',
    category: 'webhook',
    summary: 'Get current webhook status, pending updates, and last delivery error.',
    httpMethod: 'GET',
    params: [],
  },
  {
    method: 'setWebhook',
    category: 'webhook',
    summary: 'Specify an HTTPS URL to receive incoming updates via an outgoing webhook.',
    httpMethod: 'POST',
    params: [
      { name: 'url', type: 'string', required: true, description: 'HTTPS URL to send updates to', placeholder: 'https://example.com/api/webhook/bot' },
      { name: 'secret_token', type: 'string', description: 'Secret token sent in X-Telegram-Bot-Api-Secret-Token header (1-256 chars)' },
      { name: 'max_connections', type: 'number', description: 'Max simultaneous HTTPS connections (1-100)', defaultValue: 40 },
      { name: 'drop_pending_updates', type: 'boolean', description: 'Drop all pending updates', defaultValue: false },
    ],
  },
  {
    method: 'deleteWebhook',
    category: 'webhook',
    summary: 'Remove webhook integration if you decide to switch back to getUpdates.',
    httpMethod: 'POST',
    params: [
      { name: 'drop_pending_updates', type: 'boolean', description: 'Drop all pending updates', defaultValue: false },
    ],
  },
  // E. Commands
  {
    method: 'getMyCommands',
    category: 'commands',
    summary: 'Get the current list of the bot commands for the given scope and language.',
    httpMethod: 'POST',
    params: [
      { name: 'scope', type: 'json', description: 'BotCommandScope JSON object', placeholder: '{"type":"default"}' },
      { name: 'language_code', type: 'string', description: 'Two-letter ISO 639-1 language code', placeholder: 'en' },
    ],
  },
  {
    method: 'setMyCommands',
    category: 'commands',
    summary: 'Change the list of the bot commands.',
    httpMethod: 'POST',
    params: [
      { name: 'commands', type: 'json', required: true, description: 'JSON array of BotCommand objects', placeholder: '[{"command":"start","description":"Launch control menu"}]' },
      { name: 'scope', type: 'json', description: 'BotCommandScope JSON object', placeholder: '{"type":"default"}' },
      { name: 'language_code', type: 'string', description: 'Two-letter ISO 639-1 language code' },
    ],
  },
  {
    method: 'deleteMyCommands',
    category: 'commands',
    summary: 'Delete the list of the bot commands for the given scope and user language.',
    httpMethod: 'POST',
    params: [
      { name: 'scope', type: 'json', description: 'BotCommandScope JSON object', placeholder: '{"type":"default"}' },
      { name: 'language_code', type: 'string', description: 'Two-letter ISO 639-1 language code' },
    ],
  },
  // F. Chat Information
  {
    method: 'getChat',
    category: 'chat_info',
    summary: 'Get up-to-date information about the chat.',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Unique identifier for target chat or @username', placeholder: '-100192837465' },
    ],
  },
  {
    method: 'getChatMember',
    category: 'chat_info',
    summary: 'Get information about a member of a chat.',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Unique identifier for target chat or @username', placeholder: '-100192837465' },
      { name: 'user_id', type: 'number', required: true, description: 'Unique identifier of the target user', placeholder: '104829104' },
    ],
  },
  {
    method: 'getChatAdministrators',
    category: 'chat_info',
    summary: 'Get a list of administrators in a chat.',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Unique identifier for target chat or @username', placeholder: '-100192837465' },
    ],
  },
  // G. Chat Administration
  {
    method: 'banChatMember',
    category: 'chat_admin',
    summary: 'Ban a user in a group, supergroup or channel.',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Target group, supergroup or channel ID', placeholder: '-100192837465' },
      { name: 'user_id', type: 'number', required: true, description: 'Unique identifier of the target user', placeholder: '55102938' },
      { name: 'revoke_messages', type: 'boolean', description: 'Delete all messages from the chat for the user', defaultValue: false },
    ],
  },
  {
    method: 'unbanChatMember',
    category: 'chat_admin',
    summary: 'Unban a previously banned user in a supergroup or channel.',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Target supergroup or channel ID', placeholder: '-100192837465' },
      { name: 'user_id', type: 'number', required: true, description: 'Unique identifier of the target user', placeholder: '55102938' },
      { name: 'only_if_banned', type: 'boolean', description: 'Do nothing if the user is not banned', defaultValue: true },
    ],
  },
  {
    method: 'restrictChatMember',
    category: 'chat_admin',
    summary: 'Restrict a user in a supergroup.',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Target supergroup ID', placeholder: '-100192837465' },
      { name: 'user_id', type: 'number', required: true, description: 'Unique identifier of the target user', placeholder: '55102938' },
      { name: 'permissions', type: 'json', required: true, description: 'JSON object for ChatPermissions', placeholder: '{"can_send_messages":false}' },
    ],
  },
  {
    method: 'promoteChatMember',
    category: 'chat_admin',
    summary: 'Promote or demote a user in a supergroup or a channel.',
    httpMethod: 'POST',
    params: [
      { name: 'chat_id', type: 'string', required: true, description: 'Target supergroup or channel ID', placeholder: '-100192837465' },
      { name: 'user_id', type: 'number', required: true, description: 'Unique identifier of the target user', placeholder: '55102938' },
      { name: 'can_manage_chat', type: 'boolean', description: 'Allow managing chat', defaultValue: true },
      { name: 'can_delete_messages', type: 'boolean', description: 'Allow deleting messages', defaultValue: true },
      { name: 'can_pin_messages', type: 'boolean', description: 'Allow pinning messages', defaultValue: false },
    ],
  },
];

/**
 * Validates Telegram bot token format:
 * - Live token: <digits>:<30+ base64url/alphanumeric chars>
 * - Sandbox token: sandbox:<slug> (only allowed when mode is 'sandbox')
 */
export function validateBotTokenFormat(
  token: string,
  allowSandbox = true
): { valid: boolean; mode: 'live' | 'sandbox' | null; error?: string } {
  const trimmed = token.trim();
  if (!trimmed) {
    return { valid: false, mode: null, error: 'Bot token is required.' };
  }
  if (allowSandbox && /^sandbox:[a-zA-Z0-9_-]{3,40}$/.test(trimmed)) {
    return { valid: true, mode: 'sandbox' };
  }
  if (/^\d{6,15}:[A-Za-z0-9_-]{25,64}$/.test(trimmed)) {
    return { valid: true, mode: 'live' };
  }
  return {
    valid: false,
    mode: null,
    error: 'Invalid token format. Expected Telegram BotFather token (e.g., 123456789:AAH...) or sandbox:<name>.',
  };
}

/**
 * Validates Telegram bot command name (1-32 lowercase English letters, digits, underscores).
 */
export function validateCommandName(command: string): { valid: boolean; normalized: string; error?: string } {
  const normalized = command.trim().replace(/^\//, '');
  if (!normalized) {
    return { valid: false, normalized, error: 'Command name is required.' };
  }
  if (normalized.length > 32) {
    return { valid: false, normalized, error: 'Command name must be at most 32 characters.' };
  }
  if (!/^[a-z0-9_]+$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Command name can only contain lowercase letters, digits, and underscores.',
    };
  }
  return { valid: true, normalized };
}

export function validateCommandDescription(description: string): { valid: boolean; error?: string } {
  const trimmed = description.trim();
  if (trimmed.length < 3 || trimmed.length > 256) {
    return { valid: false, error: 'Description must be between 3 and 256 characters.' };
  }
  return { valid: true };
}

export function validateInlineButton(btn: InlineButtonDef): { valid: boolean; error?: string } {
  const text = btn.text.trim();
  const value = btn.value.trim();
  if (!text) {
    return { valid: false, error: 'Button label text is required.' };
  }
  if (text.length > 64) {
    return { valid: false, error: 'Button label text must be 64 characters or fewer.' };
  }
  if (!value) {
    return { valid: false, error: `Value for "${text}" is required.` };
  }
  if (btn.type === 'callback_data') {
    const byteLength = new TextEncoder().encode(value).length;
    if (byteLength > 64) {
      return { valid: false, error: `Callback data for "${text}" exceeds Telegram's 64-byte limit.` };
    }
  } else {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:' && parsed.protocol !== 'tg:') {
        return { valid: false, error: `URL for "${text}" must use https://, http://, or tg://.` };
      }
      if ((btn.type === 'web_app' || btn.type === 'login_url') && parsed.protocol !== 'https:') {
        return { valid: false, error: `${btn.type} URL for "${text}" must use HTTPS.` };
      }
    } catch {
      return { valid: false, error: `Invalid URL for "${text}".` };
    }
  }
  return { valid: true };
}

export function validateInlineKeyboard(rows: InlineButtonDef[][]): {
  valid: boolean;
  error?: string;
  markup: { inline_keyboard: Record<string, unknown>[][] };
} {
  const nonEmptyRows = rows.filter((r) => r.length > 0);
  if (nonEmptyRows.length === 0) {
    return {
      valid: false,
      error: 'Add at least one row with one button.',
      markup: { inline_keyboard: [] },
    };
  }
  let totalButtons = 0;
  const inline_keyboard: Record<string, unknown>[][] = [];

  for (const row of nonEmptyRows) {
    if (row.length > 8) {
      return {
        valid: false,
        error: 'Telegram supports at most 8 buttons per row.',
        markup: { inline_keyboard: [] },
      };
    }
    const serializedRow: Record<string, unknown>[] = [];
    for (const btn of row) {
      totalButtons++;
      const check = validateInlineButton(btn);
      if (!check.valid) {
        return { valid: false, error: check.error, markup: { inline_keyboard: [] } };
      }
      if (btn.type === 'callback_data') {
        serializedRow.push({ text: btn.text.trim(), callback_data: btn.value.trim() });
      } else if (btn.type === 'url') {
        serializedRow.push({ text: btn.text.trim(), url: btn.value.trim() });
      } else if (btn.type === 'web_app') {
        serializedRow.push({ text: btn.text.trim(), web_app: { url: btn.value.trim() } });
      } else if (btn.type === 'login_url') {
        serializedRow.push({ text: btn.text.trim(), login_url: { url: btn.value.trim() } });
      }
    }
    inline_keyboard.push(serializedRow);
  }

  if (totalButtons > 100) {
    return {
      valid: false,
      error: 'Telegram inline keyboards support a maximum of 100 buttons.',
      markup: { inline_keyboard: [] },
    };
  }

  return { valid: true, markup: { inline_keyboard } };
}

export function validateWebhookUrl(url: string): { valid: boolean; error?: string } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { valid: false, error: 'Webhook URL is required.' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Telegram requires an HTTPS webhook URL.' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format.' };
  }
}

export function formatJsonPretty(input: string): { ok: boolean; output?: string; error?: string } {
  try {
    const parsed = JSON.parse(input);
    return { ok: true, output: JSON.stringify(parsed, null, 2) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' };
  }
}

export function minifyJson(input: string): { ok: boolean; output?: string; error?: string } {
  try {
    const parsed = JSON.parse(input);
    return { ok: true, output: JSON.stringify(parsed) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' };
  }
}

/**
 * Redacts Telegram Bot tokens and secret tokens from any arbitrary string or JSON payload before logging.
 */
export function redactSecrets(input: string): string {
  return input
    .replace(/\b\d{6,15}:[A-Za-z0-9_-]{20,64}\b/g, '[REDACTED_BOT_TOKEN]')
    .replace(/(bot)\d{6,15}:[A-Za-z0-9_-]{20,64}/gi, '$1[REDACTED_BOT_TOKEN]')
    .replace(/("?(?:secret_token|password|password_hash|token|api_key|authorization)"?\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"');
}

export const MAX_REPEAT_AMOUNT = 1000;

/**
 * Keeps numeric digits while allowing the user to clear the field completely ("")
 * so Backspace never snaps back to 1 mid-edit.
 */
export function sanitizeRepeatAmountInput(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  const num = Number.parseInt(digits, 10);
  if (!Number.isFinite(num)) return '';
  if (num > MAX_REPEAT_AMOUNT) return String(MAX_REPEAT_AMOUNT);
  return String(num);
}

export function parseRepeatAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const num = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(num) || num < 1) return null;
  return Math.min(MAX_REPEAT_AMOUNT, num);
}

