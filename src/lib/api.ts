let csrfToken = '';

export function setCsrfToken(token: string) {
  csrfToken = token;
}

export function getCsrfToken(): string {
  return csrfToken;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const VAULT_STORAGE_KEY = 'xc_encrypted_vault';
const VAULT_REV_STORAGE_KEY = 'xc_encrypted_vault_rev';

function readVault(): { vault: string; rev: string } {
  try {
    return {
      vault: localStorage.getItem(VAULT_STORAGE_KEY) || '',
      rev: localStorage.getItem(VAULT_REV_STORAGE_KEY) || '',
    };
  } catch {
    return { vault: '', rev: '' };
  }
}

function writeVault(vault: string, rev: string) {
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, vault);
    localStorage.setItem(VAULT_REV_STORAGE_KEY, rev);
  } catch {
    // ignore storage quota errors
  }
}

function clearVault() {
  try {
    localStorage.removeItem(VAULT_STORAGE_KEY);
    localStorage.removeItem(VAULT_REV_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function apiFetch<T>(url: string, options: RequestInit = {}, includeVaultPayload = false): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  const stored = readVault();
  if (stored.rev) {
    headers.set('X-XC-Vault-Rev', stored.rev);
  }
  if (includeVaultPayload && stored.vault) {
    headers.set('X-XC-Vault', stored.vault);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.headers.get('X-XC-Vault-Reset') === '1') {
    clearVault();
  }

  const text = await res.text();
  let json: Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: text };
    }
  }

  if (res.status === 409 && json.code === 'VAULT_SYNC_REQUIRED' && !includeVaultPayload && stored.vault) {
    return apiFetch<T>(url, options, true);
  }

  if (!res.ok) {
    const errMsg = typeof json.error === 'string' ? json.error : `Request failed (${res.status})`;
    throw new ApiError(errMsg, res.status);
  }

  if (typeof json._vault === 'string' && typeof json._vaultRev === 'string') {
    writeVault(json._vault, json._vaultRev);
    delete json._vault;
    delete json._vaultRev;
  }

  return json as T;
}

export function downloadBlob(content: string, filename: string, mimeType = 'application/json') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
