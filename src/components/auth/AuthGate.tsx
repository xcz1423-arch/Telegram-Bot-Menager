import React, { useRef, useState } from 'react';
import { Shield, KeyRound, Eye, EyeOff, Sun, Moon, Camera, UserPlus, AlertTriangle, X, Crown, ChevronRight } from 'lucide-react';
import { ApiError, apiFetch, setCsrfToken } from '../../lib/api';
import { prepareSquareAvatarJpeg } from '../../lib/imageUtils';
import type { AdminUser, ThemeMode } from '../../types';
import { ThemeBackdrop } from '../layout/ThemeBackdrop';

export function AuthGate({
  setupRequired,
  blockedMessage,
  theme,
  onToggleTheme,
  onAuthenticated,
}: {
  setupRequired: boolean;
  blockedMessage?: string | null;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onAuthenticated: (admin: AdminUser) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register' | 'recover'>(setupRequired ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string>('');
  const [rememberMe, setRememberMe] = useState(true);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(blockedMessage || null);
  const [info, setInfo] = useState<string | null>(null);
  const [conflictToast, setConflictToast] = useState<{ title: string; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const jpeg = await prepareSquareAvatarJpeg(file, 112, 0.74);
      setAvatarDataUrl(jpeg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process selected image.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setConflictToast(null);

    if (mode === 'register') {
      if (!avatarDataUrl) {
        setError('Profile picture is required to create an account.');
        return;
      }
      if (displayName.trim().length < 2) {
        setError('Please enter your Name (minimum 2 characters).');
        return;
      }
      if (username.trim().length < 3) {
        setError('Username must be at least 3 characters.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        const res = await apiFetch<{ csrfToken: string; admin: AdminUser }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            username: username.trim(),
            displayName: displayName.trim(),
            password,
            avatarDataUrl,
          }),
        });
        setCsrfToken(res.csrfToken);
        onAuthenticated(res.admin);
      } else if (mode === 'login') {
        const res = await apiFetch<{ csrfToken: string; admin: AdminUser }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username: username.trim(), password, rememberMe }),
        });
        setCsrfToken(res.csrfToken);
        onAuthenticated(res.admin);
      } else {
        const res = await apiFetch<{ message: string }>('/api/auth/recover', {
          method: 'POST',
          body: JSON.stringify({ recoveryCode, newPassword: password }),
        });
        setInfo(res.message);
        setPassword('');
        setMode('login');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      setError(msg);
      if (err instanceof ApiError && (err.code === 'NAME_OR_USERNAME_TAKEN' || err.status === 409)) {
        const title =
          err.conflict === 'name'
            ? 'Name Already In Use'
            : err.conflict === 'username'
            ? 'Username Already In Use'
            : 'Name or Username Unavailable';
        setConflictToast({ title, message: msg });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-between bg-[#F4F6FD] dark:bg-[#070815] text-[#171A2B] dark:text-slate-100 px-4 py-4 sm:px-6 sm:py-5 overflow-x-hidden">
      <ThemeBackdrop variant="auth" />
      {conflictToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-50 rounded-2xl bg-white/90 dark:bg-[#0D1023]/90 backdrop-blur-md border border-[#F5B942]/45 shadow-2xl p-3.5 flex items-start gap-3"
        >
          <div className="w-8 h-8 rounded-xl bg-[#F5B942]/15 text-[#D99B16] dark:text-[#F5B942] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1 text-xs">
            <div className="font-semibold text-[#171A2B] dark:text-slate-100">{conflictToast.title}</div>
            <p className="text-[#73798C] dark:text-slate-300 mt-0.5 leading-relaxed">{conflictToast.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setConflictToast(null)}
            aria-label="Dismiss notification"
            className="p-1 rounded-lg text-[#73798C] hover:text-[#171A2B] dark:hover:text-white shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="relative z-10 max-w-5xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/assets/aistudio/file_000000007dd8820b9043e2e9eb3cd7c6_34c37a13.png"
            alt="XC BOT CONTROL"
            className="w-20 h-14 object-contain shrink-0 border-0 drop-shadow-[0_4px_14px_rgba(117,101,246,0.28)]"
          />
          <span className="font-display font-bold text-base tracking-tight">XC BOT CONTROL</span>
        </div>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#E2E5F3]/90 dark:border-[#7C6BFF]/30 bg-white/75 dark:bg-[#0D1023]/75 backdrop-blur-md text-[#73798C] dark:text-slate-200 hover:text-[#171A2B] dark:hover:text-white transition-colors shadow-sm"
        >
          {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
      </div>

      <main className="relative z-10 max-w-md w-full mx-auto my-2 sm:my-4">
        <div className="flex justify-center -mb-5 sm:-mb-6 relative z-10 pointer-events-none">
          <img
            src="/assets/aistudio/file_000000007dd8820b9043e2e9eb3cd7c6_34c37a13.png"
            alt="XC BOT CONTROL Logo"
            className="w-52 h-36 sm:w-64 sm:h-40 object-contain border-0 drop-shadow-[0_12px_28px_rgba(88,72,224,0.32)] dark:drop-shadow-[0_12px_32px_rgba(139,92,246,0.48)]"
          />
        </div>
        <div className="bg-white/80 dark:bg-[#0B0D1F]/76 backdrop-blur-md border border-white/85 dark:border-[#7C6BFF]/25 rounded-2xl px-6 pb-6 pt-8 sm:px-8 sm:pb-7 sm:pt-9 shadow-[0_24px_60px_rgba(92,76,228,0.14)] dark:shadow-[0_24px_64px_rgba(4,6,18,0.78),0_0_40px_rgba(117,101,246,0.14)]">
          {mode !== 'recover' && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#EEF0FA]/90 dark:bg-[#080A17]/80 border border-[#E0E4F2] dark:border-white/10 mb-5">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode('login');
                }}
                className={`py-2 min-h-[38px] text-xs font-semibold rounded-lg transition-colors ${
                  mode === 'login'
                    ? 'bg-[#6555E8] dark:bg-[#7565F6] text-white shadow-xs'
                    : 'text-[#73798C] dark:text-slate-400 hover:text-[#171A2B] dark:hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode('register');
                }}
                className={`py-2 min-h-[38px] text-xs font-semibold rounded-lg transition-colors ${
                  mode === 'register'
                    ? 'bg-[#6555E8] dark:bg-[#7565F6] text-white shadow-xs'
                    : 'text-[#73798C] dark:text-slate-400 hover:text-[#171A2B] dark:hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          <div className="mb-5">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-[#6555E8] dark:text-[#988DF9] mb-2">
              <Shield className="w-3.5 h-3.5" />
              <span>
                {setupRequired && mode === 'register'
                  ? 'Initial Primary Admin Setup'
                  : mode === 'register'
                  ? 'Developer Account Registration'
                  : 'Secure Console Access'}
              </span>
            </div>
            <h1 className="text-2xl font-display font-bold tracking-tight text-balance">
              {mode === 'register'
                ? 'Create Account'
                : mode === 'recover'
                ? 'Recover Admin Access'
                : 'Sign in to XC BOT CONTROL'}
            </h1>
            <p className="text-sm text-[#73798C] dark:text-slate-400 mt-1">
              {mode === 'register'
                ? setupRequired
                  ? 'First registered account becomes the sole Administrator.'
                  : 'Profile picture, name, username, and password are required.'
                : mode === 'recover'
                ? 'Enter your configured recovery code to reset the password.'
                : 'One Dashboard. Complete Bot Control.'}
            </p>
          </div>

          {error && (
            <div role="alert" className="mb-4 p-3 rounded-xl bg-[#F05B75]/10 border border-[#F05B75]/30 text-xs text-[#C72544] dark:text-[#F05B75]">
              {error}
            </div>
          )}

          {info && (
            <div role="status" className="mb-4 p-3 rounded-xl bg-[#20C997]/10 border border-[#20C997]/30 text-xs text-[#118A66] dark:text-[#20C997]">
              {info}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="flex items-center gap-4 p-3 rounded-xl bg-[#F1F3FA]/85 dark:bg-[#080A17]/70 border border-[#DFE3F1] dark:border-white/10">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Upload profile picture"
                  className="w-16 h-16 rounded-full border-2 border-dashed border-[#7565F6]/50 bg-white/90 dark:bg-[#12162E]/90 flex items-center justify-center overflow-hidden shrink-0 hover:border-[#7565F6] transition-colors"
                >
                  {avatarDataUrl ? (
                    <img src={avatarDataUrl} alt="Profile preview" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-5 h-5 text-[#7565F6]" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-[#171A2B] dark:text-slate-100">
                    Profile Picture <span className="text-[#F05B75]">*</span>
                  </div>
                  <p className="text-[11px] text-[#73798C] dark:text-slate-400 mt-0.5">
                    {avatarDataUrl ? 'Photo ready for registration.' : 'Required · Tap to choose a photo.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-1.5 text-[11px] font-semibold text-[#6555E8] dark:text-[#A599FF] hover:underline"
                  >
                    {avatarDataUrl ? 'Change Photo' : 'Select Photo'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarSelected}
                    className="sr-only"
                  />
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label htmlFor="xc-displayname" className="block text-xs font-medium text-[#171A2B] dark:text-slate-200 mb-1.5">
                  Full Name <span className="text-[#F05B75]">*</span>
                </label>
                <input
                  id="xc-displayname"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F1F3FA]/90 dark:bg-[#080A17]/75 border border-[#DFE3F1] dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
                />
              </div>
            )}

            {mode !== 'recover' && (
              <div>
                <label htmlFor="xc-username" className="block text-xs font-medium text-[#171A2B] dark:text-slate-200 mb-1.5">
                  Username <span className="text-[#F05B75]">*</span>
                </label>
                <input
                  id="xc-username"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F1F3FA]/90 dark:bg-[#080A17]/75 border border-[#DFE3F1] dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
                />
              </div>
            )}

            {mode === 'recover' && (
              <div>
                <label htmlFor="xc-recovery" className="block text-xs font-medium text-[#171A2B] dark:text-slate-200 mb-1.5">
                  Configured Recovery Code
                </label>
                <input
                  id="xc-recovery"
                  type="text"
                  required
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm font-mono rounded-xl bg-[#F1F3FA]/90 dark:bg-[#080A17]/75 border border-[#DFE3F1] dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
                />
              </div>
            )}

            <div>
              <label htmlFor="xc-password" className="block text-xs font-medium text-[#171A2B] dark:text-slate-200 mb-1.5">
                {mode === 'recover' ? 'New Password (min 8 chars)' : mode === 'register' ? 'Password (min 8 chars)' : 'Password'}
              </label>
              <div className="relative">
                <input
                  id="xc-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-3.5 pr-11 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F1F3FA]/90 dark:bg-[#080A17]/75 border border-[#DFE3F1] dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-[#73798C] hover:text-[#171A2B] dark:text-slate-400 dark:hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'login' && (
              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 text-[#73798C] dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-400 text-[#7565F6] focus:ring-[#7565F6]"
                  />
                  <span>Remember session (14d)</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('recover');
                  }}
                  className="text-[#6555E8] dark:text-[#988DF9] hover:underline font-medium min-h-[36px] px-1"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {mode === 'login' ? (
              <div className="pt-1.5 space-y-2.5">
                <div className="flex items-center justify-center gap-3 px-4" aria-hidden="true">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#7C5CFC]/50 to-[#7C5CFC]/70 dark:via-[#7C6BFF]/45 dark:to-[#9B8CFF]/75" />
                  <Crown className="w-4 h-4 text-[#7352F5] dark:text-[#7E6BFF] fill-[#7352F5]/20 dark:fill-[#7E6BFF]/25 drop-shadow-[0_0_8px_rgba(124,107,255,0.45)]" />
                  <div className="h-px flex-1 bg-gradient-to-l from-transparent via-[#7C5CFC]/50 to-[#7C5CFC]/70 dark:via-[#7C6BFF]/45 dark:to-[#9B8CFF]/75" />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  aria-label="Sign In"
                  data-no-smallcaps="true"
                  className="group relative w-full rounded-full p-[1.5px] bg-[linear-gradient(90deg,#8A38F5_0%,#5C5BFF_50%,#1488FF_100%)] dark:bg-[linear-gradient(90deg,#C892FF_0%,#768BFF_52%,#5FD4FF_100%)] shadow-[0_8px_24px_rgba(107,56,245,0.28),0_2px_10px_rgba(20,136,255,0.22)] dark:shadow-[0_8px_28px_rgba(104,35,255,0.52),0_0_22px_rgba(16,142,255,0.42)] hover:brightness-105 active:scale-[0.985] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span className="relative flex items-center justify-between w-full min-h-[56px] px-2.5 py-2 rounded-full overflow-hidden bg-[linear-gradient(90deg,#F3EAFF_0%,#FFFFFF_48%,#E6F2FF_100%)] dark:bg-[linear-gradient(90deg,#721BFF_0%,#5734FF_38%,#2A5FFF_70%,#0B8CFF_100%)] shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.9),inset_0_-2px_5px_rgba(106,90,235,0.14)] dark:shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.45),inset_0_-3px_8px_rgba(10,12,48,0.45)]">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-4 top-0 h-1/2 rounded-full bg-gradient-to-b from-white/55 to-transparent dark:from-white/25"
                    />
                    <span className="relative z-10 flex items-center gap-3 shrink-0">
                      <span className="w-10 h-10 rounded-full flex items-center justify-center bg-[linear-gradient(145deg,#8231FA,#4D1ED8)] dark:bg-[#190944]/70 border border-white/30 shadow-[0_3px_10px_rgba(107,38,242,0.42)] dark:shadow-inner text-white">
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 2.75 4.75 5.65v5.6c0 4.65 3.05 8.85 7.25 10.1 4.2-1.25 7.25-5.45 7.25-10.1v-5.6L12 2.75Z" />
                          <path d="M8.1 14.35h7.8l.55-4.3-2.45 1.8L12 9.15l-2 2.7-2.45-1.8.55 4.3Z" fill="currentColor" stroke="none" />
                        </svg>
                      </span>
                      <span aria-hidden="true" className="w-[1.5px] h-7 rounded-full bg-[#6842F2]/40 dark:bg-white/45" />
                    </span>

                    <span className="relative z-10 flex-1 text-center px-2">
                      <span className="block text-[17px] sm:text-[18px] font-extrabold tracking-[0.06em] leading-tight text-[#0E1128] dark:text-white">
                        {loading ? 'SIGNING IN...' : 'SIGN IN'}
                      </span>
                      <span className="block text-[11px] font-medium tracking-[0.03em] leading-tight text-[#434B6C] dark:text-white/85 mt-0.5">
                        {loading ? 'Authenticating session' : 'Access Your Account'}
                      </span>
                    </span>

                    <span className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-[linear-gradient(145deg,#2575FC,#0B4EEB)] dark:bg-[#07266B]/65 border border-white/30 shadow-[0_3px_10px_rgba(22,94,242,0.42)] dark:shadow-inner text-white transition-transform duration-200 group-hover:translate-x-0.5">
                      <ChevronRight className="w-5 h-5 stroke-[2.75]" />
                    </span>
                  </span>
                </button>
              </div>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[46px] px-4 py-2.5 text-sm font-semibold text-white bg-[#6555E8] dark:bg-[#7565F6] hover:bg-[#5747d4] rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {mode === 'register' ? (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>{loading ? 'Creating Account...' : 'Create Account'}</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>{loading ? 'Updating...' : 'Reset Admin Password'}</span>
                  </>
                )}
              </button>
            )}
          </form>

          {mode === 'recover' && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode('login');
              }}
              className="w-full mt-3 py-2 text-xs font-medium text-[#73798C] dark:text-slate-400 hover:text-[#171A2B] dark:hover:text-white"
            >
              Back to Sign In
            </button>
          )}
        </div>
      </main>

      <footer className="relative z-10 max-w-5xl w-full mx-auto text-center text-xs text-slate-600 dark:text-slate-300/80">
        AES-256-GCM Token Encryption · Scrypt Auth · CSRF Protected
      </footer>
    </div>
  );
}
