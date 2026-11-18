import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  getSuggestedWebhookBaseUrl,
  parseEnvBotTokens,
  signStatelessSession,
  verifyStatelessSession,
} from './serverless.js';

test('signStatelessSession and verifyStatelessSession validate HMAC tokens and reject tampering/expiry', () => {
  const key = crypto.randomBytes(32);
  const token = signStatelessSession(
    {
      uid: 1,
      u: 'admin',
      dn: 'Lead Developer',
      rm: true,
      csrf: 'csrf-abc',
      exp: Date.now() + 60_000,
      jti: 'jti-123',
    },
    key
  );

  const verified = verifyStatelessSession(token, key);
  assert.ok(verified);
  assert.equal(verified.u, 'admin');
  assert.equal(verified.csrf, 'csrf-abc');

  // Tamper payload
  const parts = token.split('.');
  const tampered = `${parts[0]}.${parts[1]}x.${parts[2]}`;
  assert.equal(verifyStatelessSession(tampered, key), null);

  // Wrong key
  assert.equal(verifyStatelessSession(token, crypto.randomBytes(32)), null);

  // Expired token
  const expired = signStatelessSession(
    {
      uid: 1,
      u: 'admin',
      dn: 'Lead Developer',
      rm: false,
      csrf: 'csrf-xyz',
      exp: Date.now() - 1000,
      jti: 'jti-exp',
    },
    key
  );
  assert.equal(verifyStatelessSession(expired, key), null);
});

test('parseEnvBotTokens parses single, comma-separated, and JSON env tokens while filtering invalid ones', () => {
  const liveToken = '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ1234567890';
  const sandboxToken = 'sandbox:vercel_ops_bot';

  const single = parseEnvBotTokens({ TELEGRAM_BOT_TOKEN: liveToken });
  assert.equal(single.length, 1);
  assert.equal(single[0].token, liveToken);

  const multiCsv = parseEnvBotTokens({
    TELEGRAM_BOT_TOKEN: liveToken,
    XC_BOT_TOKENS: `${liveToken}, ${sandboxToken}, bad-token`,
  });
  assert.equal(multiCsv.length, 2);
  assert.equal(multiCsv[1].token, sandboxToken);

  const multiJson = parseEnvBotTokens({
    XC_BOT_TOKENS: JSON.stringify([
      { token: liveToken, name: 'Primary Prod Bot', webhookSecret: 'sec-123' },
      { token: 'invalid' },
      sandboxToken,
    ]),
  });
  assert.equal(multiJson.length, 2);
  assert.equal(multiJson[0].name, 'Primary Prod Bot');
  assert.equal(multiJson[0].webhookSecret, 'sec-123');
});

test('getSuggestedWebhookBaseUrl prefers APP_URL then Vercel URLs then request host', () => {
  assert.equal(
    getSuggestedWebhookBaseUrl({
      appUrl: 'https://bot.example.com/',
      vercelProdUrl: 'xc-bot.vercel.app',
      vercelUrl: 'xc-bot-git-main.vercel.app',
      host: 'localhost:3000',
    }),
    'https://bot.example.com'
  );

  assert.equal(
    getSuggestedWebhookBaseUrl({
      appUrl: 'MY_APP_URL',
      vercelProdUrl: 'xc-bot.vercel.app',
      vercelUrl: 'xc-bot-git-main.vercel.app',
      host: 'localhost:3000',
    }),
    'https://xc-bot.vercel.app'
  );

  assert.equal(
    getSuggestedWebhookBaseUrl({
      vercelUrl: 'xc-bot-preview.vercel.app',
      host: 'localhost:3000',
    }),
    'https://xc-bot-preview.vercel.app'
  );

  assert.equal(
    getSuggestedWebhookBaseUrl({
      host: 'custom.vercel.app',
    }),
    'https://custom.vercel.app'
  );
});
