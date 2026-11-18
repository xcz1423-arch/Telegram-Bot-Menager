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

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: text };
    }
  }

  if (!res.ok) {
    const errMsg = typeof json.error === 'string' ? json.error : `Request failed (${res.status})`;
    throw new ApiError(errMsg, res.status);
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
