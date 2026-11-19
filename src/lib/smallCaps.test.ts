import test from 'node:test';
import assert from 'node:assert/strict';
import { toSmallCaps } from './smallCaps';

test('toSmallCaps converts standard UI text to Unicode small caps matching ᴛᴀʀɢᴇᴛ style', () => {
  assert.equal(toSmallCaps('Target'), 'ᴛᴀʀɢᴇᴛ');
  assert.equal(toSmallCaps('XC BOT CONTROL'), 'xᴄ ʙᴏᴛ ᴄᴏɴᴛʀᴏʟ');
  assert.equal(toSmallCaps('Sign In'), 'sɪɢɴ ɪɴ');
});

test('toSmallCaps is idempotent and preserves numbers and punctuation', () => {
  const once = toSmallCaps('Dashboard · 24/7');
  assert.equal(toSmallCaps(once), once);
  assert.equal(once, 'ᴅᴀsʜʙᴏᴀʀᴅ · 24/7');
});

test('toSmallCaps preserves URLs, @usernames, and tokens without corrupting identifiers', () => {
  assert.equal(
    toSmallCaps('Connected @photoremini_bot at https://example.com/webhook'),
    'ᴄᴏɴɴᴇᴄᴛᴇᴅ @photoremini_bot ᴀᴛ https://example.com/webhook'
  );
  assert.equal(
    toSmallCaps('Use sandbox:relay_123 for local testing'),
    'ᴜsᴇ sandbox:relay_123 ғᴏʀ ʟᴏᴄᴀʟ ᴛᴇsᴛɪɴɢ'
  );
});
