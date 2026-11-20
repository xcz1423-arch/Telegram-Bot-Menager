import { decryptVaultBytes, encryptVaultBytes } from './crypto.js';

const VAULT_STORAGE_KEY = 'xc_bot_control_vault_v1';

interface KvConfig {
  provider: 'Vercel KV / Upstash Redis';
  url: string;
  token: string;
}

function getKvConfig(): KvConfig | null {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!url || !token) return null;
  return {
    provider: 'Vercel KV / Upstash Redis',
    url,
    token,
  };
}

function getBlobToken(): string | null {
  const token = (process.env.BLOB_READ_WRITE_TOKEN || '').trim();
  return token || null;
}

export function getCloudSyncProvider(): string | null {
  if (getKvConfig()) return 'Vercel KV / Upstash Redis';
  if (getBlobToken()) return 'Vercel Blob';
  return null;
}

export function isCloudSyncConfigured(): boolean {
  return Boolean(getCloudSyncProvider());
}

/**
 * Pulls the latest encrypted SQLite vault from configured remote KV/Blob storage
 * so serverless cold starts and cross-device logins share one persistent workspace.
 */
export async function pullCloudVault(): Promise<Uint8Array | null> {
  const kv = getKvConfig();
  if (kv) {
    try {
      const resp = await fetch(kv.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kv.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['GET', VAULT_STORAGE_KEY]),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as { result?: unknown };
      if (typeof data.result === 'string' && data.result.startsWith('v2:')) {
        return decryptVaultBytes(data.result);
      }
      return null;
    } catch {
      return null;
    }
  }

  const blobToken = getBlobToken();
  if (blobToken) {
    try {
      const listResp = await fetch(
        `https://blob.vercel-storage.com?prefix=${encodeURIComponent('xc-bot-control/vault')}&limit=5`,
        {
          headers: { Authorization: `Bearer ${blobToken}` },
        }
      );
      if (!listResp.ok) return null;
      const listJson = (await listResp.json()) as {
        blobs?: Array<{ url?: string; uploadedAt?: string; pathname?: string }>;
      };
      const blobs = Array.isArray(listJson.blobs) ? listJson.blobs : [];
      const sorted = blobs
        .filter((b) => typeof b.url === 'string' && b.pathname?.includes('vault'))
        .sort((a, b) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || '')));
      const latestUrl = sorted[0]?.url;
      if (!latestUrl) return null;
      const fileResp = await fetch(latestUrl);
      if (!fileResp.ok) return null;
      const payload = (await fileResp.text()).trim();
      if (!payload.startsWith('v2:')) return null;
      return decryptVaultBytes(payload);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Persists the AES-256-GCM encrypted SQLite vault to configured remote KV/Blob storage.
 */
export async function pushCloudVault(rawDbBytes: Uint8Array): Promise<boolean> {
  const kv = getKvConfig();
  const blobToken = getBlobToken();
  if (!kv && !blobToken) return false;

  const encrypted = encryptVaultBytes(rawDbBytes);

  if (kv) {
    try {
      const resp = await fetch(kv.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kv.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['SET', VAULT_STORAGE_KEY, encrypted]),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  if (blobToken) {
    try {
      const resp = await fetch('https://blob.vercel-storage.com/xc-bot-control/vault.enc', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${blobToken}`,
          'x-content-type': 'text/plain',
          'x-add-random-suffix': '0',
          'x-allow-overwrite': '1',
        },
        body: encrypted,
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  return false;
}
