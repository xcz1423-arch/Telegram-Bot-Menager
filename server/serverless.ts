import crypto from 'node:crypto';
import { validateBotTokenFormat } from '../src/lib/telegramSpec.js';

export interface SignedSessionPayload {
  uid: number;
  u: string;
  dn: string;
  rm: boolean;
  csrf: string;
  exp: number;
  jti: string;
  sv?: number;
}

export interface EnvBotEntry {
  token: string;
  name?: string;
  webhookSecret?: string;
}

/**
 * Signs a session payload with HMAC-SHA256 so admin sessions survive Vercel
 * serverless cold starts and horizontal multi-instance routing.
 */
export function signStatelessSession(payload: SignedSessionPayload, key: Buffer): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', key).update(encoded).digest('base64url');
  return `v1.${encoded}.${sig}`;
}

export function verifyStatelessSession(
  token: string,
  key: Buffer,
  nowMs = Date.now()
): SignedSessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;

  const [, encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', key).update(encoded).digest();
  let actualSig: Buffer;
  try {
    actualSig = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (expectedSig.length !== actualSig.length) return null;
  if (!crypto.timingSafeEqual(expectedSig, actualSig)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedSessionPayload;
    if (
      typeof parsed.uid !== 'number' ||
      typeof parsed.u !== 'string' ||
      typeof parsed.dn !== 'string' ||
      typeof parsed.csrf !== 'string' ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= nowMs
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Parses bot tokens from TELEGRAM_BOT_TOKEN and XC_BOT_TOKENS environment variables.
 * Supports single token, comma/newline separated tokens, or JSON arrays of strings/objects.
 */
export function parseEnvBotTokens(env: {
  TELEGRAM_BOT_TOKEN?: string;
  XC_BOT_TOKENS?: string;
}): EnvBotEntry[] {
  const entries: EnvBotEntry[] = [];
  const seen = new Set<string>();

  const pushEntry = (rawToken: string, name?: string, webhookSecret?: string) => {
    const token = rawToken.trim();
    if (!token || seen.has(token)) return;
    if (!validateBotTokenFormat(token).valid) return;
    seen.add(token);
    entries.push({ token, name: name?.trim() || undefined, webhookSecret: webhookSecret?.trim() || undefined });
  };

  if (env.TELEGRAM_BOT_TOKEN) {
    pushEntry(env.TELEGRAM_BOT_TOKEN);
  }

  const rawMulti = env.XC_BOT_TOKENS?.trim();
  if (rawMulti) {
    if (rawMulti.startsWith('[')) {
      try {
        const parsed = JSON.parse(rawMulti) as unknown;
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === 'string') {
              pushEntry(item);
            } else if (item && typeof item === 'object') {
              const obj = item as { token?: unknown; name?: unknown; webhookSecret?: unknown };
              if (typeof obj.token === 'string') {
                pushEntry(
                  obj.token,
                  typeof obj.name === 'string' ? obj.name : undefined,
                  typeof obj.webhookSecret === 'string' ? obj.webhookSecret : undefined
                );
              }
            }
          }
          return entries;
        }
      } catch {
        // Fall through to comma/newline parsing
      }
    }

    for (const part of rawMulti.split(/[\n,]+/)) {
      pushEntry(part);
    }
  }

  return entries;
}

/**
 * Resolves the canonical public HTTPS origin for Telegram Webhooks on Vercel or custom hosts.
 */
export function getSuggestedWebhookBaseUrl(params: {
  appUrl?: string;
  vercelProdUrl?: string;
  vercelUrl?: string;
  host?: string;
  proto?: string;
}): string {
  const normalize = (raw: string): string => {
    const trimmed = raw.trim().replace(/\/$/, '');
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    return `https://${trimmed}`;
  };

  if (params.appUrl && params.appUrl !== 'MY_APP_URL' && !params.appUrl.includes('your-domain.example.com')) {
    return normalize(params.appUrl);
  }
  if (params.vercelProdUrl) {
    return normalize(params.vercelProdUrl);
  }
  if (params.vercelUrl) {
    return normalize(params.vercelUrl);
  }
  const host = params.host || 'localhost:3000';
  const proto = params.proto === 'http' && host.includes('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
}
