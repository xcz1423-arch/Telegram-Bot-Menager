import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getMasterKey } from './crypto.js';
import { db } from './db.js';
import { signStatelessSession, verifyStatelessSession } from './serverless.js';

export const SESSION_COOKIE_NAME = 'xc_session';

export interface AuthenticatedSession {
  sessionId: number;
  userId: number;
  username: string;
  displayName: string;
  role: 'admin' | 'user';
  avatarUrl: string | null;
  badge: string;
  isBlocked: boolean;
  createdIp: string | null;
  csrfToken: string;
  rememberMe: boolean;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedSession;
    }
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = val;
  }
  return out;
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

// Simple in-memory sliding window rate limiters
const loginFailuresByIp = new Map<string, { count: number; lockedUntil: number }>();
const apiRequestsByIp = new Map<string, { count: number; windowStart: number }>();

export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const rec = loginFailuresByIp.get(ip);
  if (!rec) return { allowed: true };
  if (rec.lockedUntil > Date.now()) {
    return { allowed: false, retryAfterSeconds: Math.ceil((rec.lockedUntil - Date.now()) / 1000) };
  }
  return { allowed: true };
}

export function recordLoginAttempt(ip: string, success: boolean): void {
  if (success) {
    loginFailuresByIp.delete(ip);
    return;
  }
  const existing = loginFailuresByIp.get(ip) || { count: 0, lockedUntil: 0 };
  const nextCount = existing.count + 1;
  const lockedUntil = nextCount >= 5 ? Date.now() + 60_000 : 0; // 60s lockout after 5 failures
  loginFailuresByIp.set(ip, { count: nextCount >= 5 ? 0 : nextCount, lockedUntil });
}

export function apiRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const now = Date.now();
  const windowMs = 60_000;
  const maxReqs = 300;
  const current = apiRequestsByIp.get(ip);
  if (!current || now - current.windowStart > windowMs) {
    apiRequestsByIp.set(ip, { count: 1, windowStart: now });
    next();
    return;
  }
  current.count += 1;
  if (current.count > maxReqs) {
    res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment and retry.' });
    return;
  }
  next();
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  next();
}

export function revokeSessionTokenHash(tokenHash: string, expiresAtIso?: string): void {
  const exp = expiresAtIso || new Date(Date.now() + 14 * 86400_000).toISOString();
  db.prepare(`
    INSERT INTO revoked_sessions (token_hash, expires_at)
    VALUES (?, ?)
    ON CONFLICT(token_hash) DO UPDATE SET expires_at = excluded.expires_at, revoked_at = datetime('now')
  `).run(tokenHash, exp);
  try {
    db.prepare(`DELETE FROM revoked_sessions WHERE expires_at <= datetime('now')`).run();
  } catch {
    // ignore cleanup issues
  }
}

export function createAdminSession(params: {
  userId: number;
  rememberMe: boolean;
  ipAddress: string;
  userAgent: string;
}): { rawToken: string; csrfToken: string; expiresAt: Date } {
  const userRow = db
    .prepare('SELECT username, display_name, session_version FROM admin_users WHERE id = ?')
    .get(params.userId) as { username: string; display_name: string; session_version?: number } | undefined;

  const csrfToken = crypto.randomBytes(24).toString('hex');
  const ttlMs = params.rememberMe ? 14 * 86400_000 : 12 * 3600_000;
  const expiresAt = new Date(Date.now() + ttlMs);
  const rawToken = signStatelessSession(
    {
      uid: params.userId,
      u: userRow?.username || 'admin',
      dn: userRow?.display_name || 'Lead Developer',
      rm: params.rememberMe,
      csrf: csrfToken,
      exp: expiresAt.getTime(),
      jti: crypto.randomBytes(12).toString('hex'),
      sv: userRow?.session_version ?? 1,
    },
    getMasterKey()
  );

  db.prepare(`
    INSERT INTO admin_sessions (session_token_hash, csrf_token, user_id, user_agent, ip_address, remember_me, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    hashSessionToken(rawToken),
    csrfToken,
    params.userId,
    params.userAgent.slice(0, 240),
    params.ipAddress,
    params.rememberMe ? 1 : 0,
    expiresAt.toISOString()
  );

  return { rawToken, csrfToken, expiresAt };
}

export function setSessionCookie(res: Response, rawToken: string, expiresAt: Date): void {
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (isProd) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  const secureFlag = isProd ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`);
}

export interface ResolvedSession {
  sessionId: number;
  userId: number;
  username: string;
  displayName: string;
  role: 'admin' | 'user';
  avatarUrl: string | null;
  badge: string;
  isBlocked: boolean;
  createdIp: string | null;
  csrfToken: string;
  rememberMe: boolean;
  lastLoginAt: string | null;
}

export function resolveSessionFromRequest(req: Request): { session: ResolvedSession | null; hadCookie: boolean; blocked?: boolean } {
  const cookies = parseCookies(req.headers.cookie);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (!rawToken) {
    return { session: null, hadCookie: false };
  }

  const tokenHash = hashSessionToken(rawToken);
  const revoked = db
    .prepare('SELECT token_hash FROM revoked_sessions WHERE token_hash = ?')
    .get(tokenHash) as { token_hash: string } | undefined;
  if (revoked) {
    return { session: null, hadCookie: true };
  }

  const row = db
    .prepare(`
      SELECT s.id as session_id, s.csrf_token, s.user_id, s.remember_me, s.expires_at,
             u.username, u.display_name, u.role, u.avatar_url, u.badge, u.is_blocked, u.created_ip, u.last_login_at
      FROM admin_sessions s
      JOIN admin_users u ON u.id = s.user_id
      WHERE s.session_token_hash = ?
    `)
    .get(tokenHash) as
    | {
        session_id: number;
        csrf_token: string;
        user_id: number;
        remember_me: number;
        expires_at: string;
        username: string;
        display_name: string;
        role: string;
        avatar_url: string | null;
        badge: string;
        is_blocked: number;
        created_ip: string | null;
        last_login_at: string | null;
      }
    | undefined;

  if (row) {
    if (Boolean(row.is_blocked)) {
      db.prepare('DELETE FROM admin_sessions WHERE user_id = ?').run(row.user_id);
      return { session: null, hadCookie: true, blocked: true };
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(row.session_id);
      return { session: null, hadCookie: true };
    }
    db.prepare(`UPDATE admin_sessions SET last_seen_at = datetime('now') WHERE id = ?`).run(row.session_id);
    return {
      hadCookie: true,
      session: {
        sessionId: row.session_id,
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        role: row.role === 'admin' ? 'admin' : 'user',
        avatarUrl: row.avatar_url || null,
        badge: row.badge || 'none',
        isBlocked: false,
        createdIp: row.created_ip || null,
        csrfToken: row.csrf_token,
        rememberMe: Boolean(row.remember_me),
        lastLoginAt: row.last_login_at,
      },
    };
  }

  // Fallback for Vercel serverless cold starts / horizontal invocations:
  // Verify the HMAC-SHA256 signed session cookie directly.
  const verified = verifyStatelessSession(rawToken, getMasterKey());
  if (!verified) {
    return { session: null, hadCookie: true };
  }

  const dbUser = db
    .prepare('SELECT id, username, display_name, role, avatar_url, badge, is_blocked, created_ip, last_login_at, session_version FROM admin_users WHERE id = ? OR LOWER(username) = LOWER(?)')
    .get(verified.uid, verified.u) as
    | {
        id: number;
        username: string;
        display_name: string;
        role: string;
        avatar_url: string | null;
        badge: string;
        is_blocked: number;
        created_ip: string | null;
        last_login_at: string | null;
        session_version?: number;
      }
    | undefined;

  if (dbUser && Boolean(dbUser.is_blocked)) {
    return { session: null, hadCookie: true, blocked: true };
  }

  if (dbUser && verified.sv !== undefined && verified.sv < (dbUser.session_version ?? 1)) {
    return { session: null, hadCookie: true };
  }

  // If users exist in DB and this stateless user was deleted, reject
  const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM admin_users').get() as { cnt: number }).cnt;
  if (userCount > 0 && !dbUser) {
    return { session: null, hadCookie: true };
  }

  return {
    hadCookie: true,
    session: {
      sessionId: 0,
      userId: dbUser?.id ?? verified.uid,
      username: dbUser?.username ?? verified.u,
      displayName: dbUser?.display_name ?? verified.dn,
      role: dbUser?.role === 'admin' ? 'admin' : 'user',
      avatarUrl: dbUser?.avatar_url || null,
      badge: dbUser?.badge || 'none',
      isBlocked: false,
      createdIp: dbUser?.created_ip || null,
      csrfToken: verified.csrf,
      rememberMe: verified.rm,
      lastLoginAt: dbUser?.last_login_at ?? null,
    },
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { session, hadCookie, blocked } = resolveSessionFromRequest(req);
  if (!session) {
    if (hadCookie) {
      clearSessionCookie(res);
      if (blocked) {
        res.status(403).json({ error: 'Your account has been blocked by the administrator.' });
        return;
      }
      res.status(401).json({ error: 'Session expired. Please sign in again.' });
      return;
    }
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  // CSRF check for mutating requests
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
  if (mutating) {
    const headerCsrf = req.headers['x-csrf-token'];
    if (typeof headerCsrf !== 'string' || headerCsrf !== session.csrfToken) {
      res.status(403).json({ error: 'Invalid or missing CSRF token.' });
      return;
    }
  }

  req.auth = {
    sessionId: session.sessionId,
    userId: session.userId,
    username: session.username,
    displayName: session.displayName,
    role: session.role,
    avatarUrl: session.avatarUrl,
    badge: session.badge,
    isBlocked: session.isBlocked,
    createdIp: session.createdIp,
    csrfToken: session.csrfToken,
    rememberMe: session.rememberMe,
  };
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth || req.auth.role !== 'admin') {
    res.status(403).json({ error: 'Administrator privileges are required for this action.' });
    return;
  }
  next();
}
