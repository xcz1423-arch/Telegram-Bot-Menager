import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

function resolveKeyStorageDir(): string {
  if (process.env.XC_STORAGE_DIR) {
    return path.resolve(process.env.XC_STORAGE_DIR);
  }
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), 'xc_bot_control');
  }
  return path.resolve(process.cwd(), 'storage');
}

let cachedKey: Buffer | null = null;

export function hasExplicitMasterKey(): boolean {
  const envKey = process.env.XC_MASTER_KEY;
  return Boolean(envKey && envKey !== 'CHANGE_ME_TO_A_STRONG_64_HEX_MASTER_KEY');
}

export function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;

  const envKey = process.env.XC_MASTER_KEY;
  if (envKey && envKey !== 'CHANGE_ME_TO_A_STRONG_64_HEX_MASTER_KEY') {
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
      cachedKey = Buffer.from(envKey, 'hex');
      return cachedKey;
    }
    cachedKey = crypto.createHash('sha256').update(envKey).digest();
    return cachedKey;
  }

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const stableOrigin =
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL' ? process.env.APP_URL : '') ||
      process.env.VERCEL_URL ||
      '';
    const seedMaterial = [
      process.env.XC_SESSION_SECRET,
      process.env.XC_ADMIN_PASSWORD,
      process.env.XC_RECOVERY_CODE,
      stableOrigin,
      'xc-bot-control-serverless-fallback',
    ]
      .filter(Boolean)
      .join(':');
    cachedKey = crypto.createHash('sha256').update(seedMaterial).digest();
    return cachedKey;
  }

  const storageDir = resolveKeyStorageDir();
  const keyFile = path.join(storageDir, '.master.key');
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  if (fs.existsSync(keyFile)) {
    const hex = fs.readFileSync(keyFile, 'utf8').trim();
    if (/^[0-9a-fA-F]{64}$/.test(hex)) {
      cachedKey = Buffer.from(hex, 'hex');
      return cachedKey;
    }
  }
  const generated = crypto.randomBytes(32);
  fs.writeFileSync(keyFile, generated.toString('hex'), { mode: 0o600 });
  cachedKey = generated;
  return cachedKey;
}

/**
 * Encrypts sensitive bot tokens using AES-256-GCM authenticated encryption.
 * Format: v1:<ivHex>:<authTagHex>:<ciphertextHex>
 */
export function encryptToken(plaintext: string, keyOverride?: Buffer): string {
  const key = keyOverride || getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptToken(payload: string, keyOverride?: Buffer): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Malformed encrypted token payload');
  }
  const [, ivHex, tagHex, dataHex] = parts;
  const key = keyOverride || getMasterKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed.startsWith('sandbox:')) {
    return `${trimmed.slice(0, 14)}••••`;
  }
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx > 0) {
    const botId = trimmed.slice(0, colonIdx);
    const tail = trimmed.slice(-4);
    return `${botId}:••••••••••••${tail}`;
  }
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export function hashTokenFingerprint(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Hashes admin passwords using Node's native scrypt with a 16-byte random salt.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hexHash] = parts;
  const expected = Buffer.from(hexHash, 'hex');
  const actual = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function generateRandomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function computeBackupChecksum(data: unknown): string {
  const serialized = JSON.stringify(data);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

/**
 * Compresses and encrypts a binary SQLite snapshot with AES-256-GCM so serverless
 * instances stay synchronized without exposing any plaintext tokens or secrets.
 */
export function encryptVaultBytes(rawBytes: Uint8Array, keyOverride?: Buffer): string {
  const compressed = zlib.gzipSync(Buffer.from(rawBytes), { level: 9 });
  const key = keyOverride || getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('base64url')}`;
}

export function decryptVaultBytes(payload: string, keyOverride?: Buffer): Uint8Array {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v2') {
    throw new Error('Malformed encrypted vault payload');
  }
  const [, ivHex, tagHex, dataB64] = parts;
  const key = keyOverride || getMasterKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const compressed = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]);
  return new Uint8Array(zlib.gunzipSync(compressed));
}
