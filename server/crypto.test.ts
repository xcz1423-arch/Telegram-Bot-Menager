import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  encryptToken,
  decryptToken,
  maskToken,
  hashTokenFingerprint,
  hashPassword,
  verifyPassword,
  computeBackupChecksum,
  encryptVaultBytes,
  decryptVaultBytes,
} from './crypto.js';

test('encryptToken and decryptToken perform AES-256-GCM round-trip and detect tampering', () => {
  const key = crypto.randomBytes(32);
  const rawToken = '7123456789:AAH_xYz9876543210abcdefghijklmnop';
  const encrypted = encryptToken(rawToken, key);

  assert.equal(encrypted.startsWith('v1:'), true);
  assert.equal(encrypted.includes('AAH_xYz'), false);

  const decrypted = decryptToken(encrypted, key);
  assert.equal(decrypted, rawToken);

  // Tamper ciphertext
  const parts = encrypted.split(':');
  const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${'ff'.repeat(parts[3].length / 2)}`;
  assert.throws(() => decryptToken(tampered, key));
});

test('maskToken never exposes full secret token', () => {
  const masked = maskToken('7123456789:AAH_xYz9876543210abcdefghijklmnop');
  assert.equal(masked, '7123456789:••••••••••••mnop');
  assert.equal(masked.includes('AAH_xYz'), false);
});

test('hashTokenFingerprint produces deterministic SHA-256 for duplicate detection', () => {
  const h1 = hashTokenFingerprint('123456:ABC');
  const h2 = hashTokenFingerprint(' 123456:ABC ');
  const h3 = hashTokenFingerprint('123456:XYZ');
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
});

test('hashPassword and verifyPassword validate scrypt hashes securely', () => {
  const hash = hashPassword('Sup3rStr0ng!Pass');
  assert.equal(hash.startsWith('scrypt:'), true);
  assert.equal(verifyPassword('Sup3rStr0ng!Pass', hash), true);
  assert.equal(verifyPassword('WrongPassword', hash), false);
});

test('computeBackupChecksum detects payload modification', () => {
  const payload = { version: 1, bots: [{ id: 1, username: 'demo_bot' }] };
  const c1 = computeBackupChecksum(payload);
  const c2 = computeBackupChecksum({ version: 1, bots: [{ id: 1, username: 'tampered_bot' }] });
  assert.notEqual(c1, c2);
});

test('encryptVaultBytes and decryptVaultBytes round-trip compressed SQLite snapshots and reject tampering', () => {
  const key = crypto.randomBytes(32);
  const sample = new Uint8Array(Buffer.from('SQLite format 3\0' + 'x'.repeat(256)));
  const encrypted = encryptVaultBytes(sample, key);
  assert.equal(encrypted.startsWith('v2:'), true);

  const decrypted = decryptVaultBytes(encrypted, key);
  assert.deepEqual(decrypted, sample);

  // Wrong key fails GCM authentication
  assert.throws(() => decryptVaultBytes(encrypted, crypto.randomBytes(32)));
});
