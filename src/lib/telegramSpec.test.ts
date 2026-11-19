import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBotTokenFormat,
  validateCommandName,
  validateCommandDescription,
  validateInlineKeyboard,
  validateWebhookUrl,
  formatJsonPretty,
  minifyJson,
  redactSecrets,
} from './telegramSpec';

test('validateBotTokenFormat accepts live Telegram tokens and sandbox tokens', () => {
  const live = validateBotTokenFormat('7123456789:AAH_xYz9876543210abcdefghijklmnop');
  assert.equal(live.valid, true);
  assert.equal(live.mode, 'live');

  const sandbox = validateBotTokenFormat('sandbox:commerce_demo');
  assert.equal(sandbox.valid, true);
  assert.equal(sandbox.mode, 'sandbox');

  const invalid = validateBotTokenFormat('not-a-valid-token');
  assert.equal(invalid.valid, false);
  assert.equal(invalid.mode, null);

  const disallowedSandbox = validateBotTokenFormat('sandbox:demo', false);
  assert.equal(disallowedSandbox.valid, false);
});

test('validateCommandName normalizes leading slash and enforces Telegram rules', () => {
  const valid = validateCommandName('/start_bot_1');
  assert.equal(valid.valid, true);
  assert.equal(valid.normalized, 'start_bot_1');

  const uppercase = validateCommandName('Start');
  assert.equal(uppercase.valid, false);

  const tooLong = validateCommandName('a'.repeat(33));
  assert.equal(tooLong.valid, false);

  assert.equal(validateCommandDescription('ok').valid, false);
  assert.equal(validateCommandDescription('Launch control menu').valid, true);
});

test('validateInlineKeyboard validates callback bytes, HTTPS web_app, and generates markup', () => {
  const good = validateInlineKeyboard([
    [
      { id: '1', text: 'Refresh', type: 'callback_data', value: 'refresh_stats' },
      { id: '2', text: 'Docs', type: 'url', value: 'https://core.telegram.org/bots/api' },
    ],
    [{ id: '3', text: 'Console', type: 'web_app', value: 'https://xc.example.com/app' }],
  ]);
  assert.equal(good.valid, true);
  assert.equal(good.markup.inline_keyboard.length, 2);
  assert.deepEqual(good.markup.inline_keyboard[0][0], {
    text: 'Refresh',
    callback_data: 'refresh_stats',
  });

  const badWebApp = validateInlineKeyboard([
    [{ id: '1', text: 'App', type: 'web_app', value: 'http://insecure.local' }],
  ]);
  assert.equal(badWebApp.valid, false);

  const badBytes = validateInlineKeyboard([
    [{ id: '1', text: 'Big', type: 'callback_data', value: 'x'.repeat(65) }],
  ]);
  assert.equal(badBytes.valid, false);
});

test('validateWebhookUrl requires HTTPS', () => {
  assert.equal(validateWebhookUrl('https://bot.example.com/api/webhook/1').valid, true);
  assert.equal(validateWebhookUrl('http://bot.example.com/webhook').valid, false);
  assert.equal(validateWebhookUrl('not-a-url').valid, false);
});

test('JSON formatting and secret redaction', () => {
  const pretty = formatJsonPretty('{"ok":true,"result":{"id":1}}');
  assert.equal(pretty.ok, true);
  assert.match(pretty.output || '', /\n  "ok": true/);

  const mini = minifyJson('{\n  "a": 1,\n  "b": 2\n}');
  assert.equal(mini.ok, true);
  assert.equal(mini.output, '{"a":1,"b":2}');

  const rawLog = 'POST https://api.telegram.org/bot7123456789:AAH_xYz9876543210abcdefghijklmnop/sendMessage {"secret_token":"my-secret"}';
  const safe = redactSecrets(rawLog);
  assert.equal(safe.includes('AAH_xYz'), false);
  assert.equal(safe.includes('my-secret'), false);
  assert.equal(safe.includes('[REDACTED_BOT_TOKEN]'), true);
});

test('TELEGRAM_API_METHODS exposes profile photo management methods', async () => {
  const { TELEGRAM_API_METHODS } = await import('./telegramSpec');
  const setPhoto = TELEGRAM_API_METHODS.find((m) => m.method === 'setMyProfilePhoto');
  const removePhoto = TELEGRAM_API_METHODS.find((m) => m.method === 'removeMyProfilePhoto');
  assert.equal(setPhoto?.category, 'bot_info');
  assert.equal(removePhoto?.category, 'bot_info');
});

test('sanitizeRepeatAmountInput allows clearing 1 and setting custom limits up to 1000', async () => {
  const { sanitizeRepeatAmountInput, parseRepeatAmount, MAX_REPEAT_AMOUNT } = await import('./telegramSpec');
  assert.equal(sanitizeRepeatAmountInput(''), '');
  assert.equal(sanitizeRepeatAmountInput('abc'), '');
  assert.equal(sanitizeRepeatAmountInput('0'), '0');
  assert.equal(sanitizeRepeatAmountInput('75'), '75');
  assert.equal(sanitizeRepeatAmountInput('250'), '250');
  assert.equal(sanitizeRepeatAmountInput('5000'), String(MAX_REPEAT_AMOUNT));

  assert.equal(parseRepeatAmount(''), null);
  assert.equal(parseRepeatAmount('0'), null);
  assert.equal(parseRepeatAmount('1'), 1);
  assert.equal(parseRepeatAmount('75'), 75);
  assert.equal(parseRepeatAmount('1000'), 1000);
});


