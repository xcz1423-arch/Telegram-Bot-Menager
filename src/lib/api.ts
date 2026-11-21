let csrfToken = '';
let sessionTokenFallback = '';
const SESSION_FALLBACK_KEY = 'xc_session_token';

try {
  sessionTokenFallback = sessionStorage.getItem(SESSION_FALLBACK_KEY) || '';
} catch {
  sessionTokenFallback = '';
}

export function setCsrfToken(token: string) {
  csrfToken = token;
}

export function getCsrfToken(): string {
  return csrfToken;
}

export function setSessionToken(token: string) {
  sessionTokenFallback = token;
  try {
    if (token) {
      sessionStorage.setItem(SESSION_FALLBACK_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_FALLBACK_KEY);
    }
  } catch {
    // ignore storage access issues
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  conflict?: string;
  constructor(message: string, status: number, code?: string, conflict?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.conflict = conflict;
  }
}

const VAULT_STORAGE_KEY = 'xc_encrypted_vault';
const VAULT_REV_STORAGE_KEY = 'xc_encrypted_vault_rev';

function parseVaultSeq(rev: string | undefined | null): number {
  if (!rev || rev === 'init') return 0;
  const idx = rev.indexOf(':');
  if (idx <= 0) return 0;
  const n = Number.parseInt(rev.slice(0, idx), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

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
  if (sessionTokenFallback && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${sessionTokenFallback}`);
  }

  const stored = readVault();
  if (stored.rev) {
    headers.set('X-XC-Vault-Rev', stored.rev);
  }

  const shouldProactivelyAttachVault =
    includeVaultPayload ||
    url === '/api/auth/login' ||
    url === '/api/auth/register' ||
    (url.startsWith('/api/bots') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method));

  let requestOptions = { ...options };
  if (shouldProactivelyAttachVault && stored.vault) {
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (isMutating) {
      let bodyObj: Record<string, unknown> = {};
      if (typeof options.body === 'string' && options.body.trim()) {
        try {
          bodyObj = JSON.parse(options.body) as Record<string, unknown>;
        } catch {
          bodyObj = {};
        }
      }
      bodyObj._vault = stored.vault;
      requestOptions = { ...options, body: JSON.stringify(bodyObj) };
      headers.set('Content-Type', 'application/json');
    } else if (stored.vault.length <= 12000) {
      headers.set('X-XC-Vault', stored.vault);
    } else {
      await fetch('/api/vault/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(stored.rev ? { 'X-XC-Vault-Rev': stored.rev } : {}),
          ...(sessionTokenFallback ? { Authorization: `Bearer ${sessionTokenFallback}` } : {}),
        },
        body: JSON.stringify({ _vault: stored.vault }),
        credentials: 'include',
      });
    }
  }

  const res = await fetch(url, {
    ...requestOptions,
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
    if (res.status === 401 && url !== '/api/auth/login') {
      setSessionToken('');
    }
    const errMsg = typeof json.error === 'string' ? json.error : `Request failed (${res.status})`;
    const errCode = typeof json.code === 'string' ? json.code : undefined;
    const errConflict = typeof json.conflict === 'string' ? json.conflict : undefined;
    throw new ApiError(errMsg, res.status, errCode, errConflict);
  }

  if (typeof json.sessionToken === 'string' && json.sessionToken) {
    setSessionToken(json.sessionToken);
  }

  if (typeof json._vault === 'string' && typeof json._vaultRev === 'string') {
    const serverReset = res.headers.get('X-XC-Vault-Reset') === '1';
    const currentLocalSeq = parseVaultSeq(stored.rev);
    const incomingSeq = parseVaultSeq(json._vaultRev);
    if (serverReset || currentLocalSeq === 0 || incomingSeq >= currentLocalSeq) {
      writeVault(json._vault, json._vaultRev);
    }
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
