import React, { useRef, useState } from 'react';
import { Shield, KeyRound, Eye, EyeOff, ArrowRight, Sun, Moon, Terminal, Camera, UserPlus } from 'lucide-react';
import { apiFetch, setCsrfToken } from '../../lib/api';
import { prepareSquareAvatarJpeg } from '../../lib/imageUtils';
import type { AdminUser, ThemeMode } from '../../types';

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
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F6F7FB] dark:bg-[#090B14] text-[#171A2B] dark:text-slate-100 px-4 py-6 sm:px-6">
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#6555E8] dark:bg-[#7565F6] flex items-center justify-center text-white shadow-sm">
            <Terminal className="w-4 h-4" />
          </div>
          <span className="font-display font-bold text-base tracking-tight">XC BOT CONTROL</span>
        </div>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#E8EAF1] dark:border-slate-800 bg-white dark:bg-[#151B2B] text-[#73798C] dark:text-slate-300 hover:text-[#171A2B] dark:hover:text-white transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <main className="max-w-md w-full mx-auto my-8">
        <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm">
          {mode !== 'recover' && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 mb-5">
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
              <div className="flex items-center gap-4 p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Upload profile picture"
                  className="w-16 h-16 rounded-full border-2 border-dashed border-[#7565F6]/50 bg-white dark:bg-[#151B2B] flex items-center justify-center overflow-hidden shrink-0 hover:border-[#7565F6] transition-colors"
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
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
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
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
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
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
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
                  className="w-full pl-3.5 pr-11 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
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
              ) : mode === 'recover' ? (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>{loading ? 'Updating...' : 'Reset Admin Password'}</span>
                </>
              ) : (
                <>
                  <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
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

      <footer className="max-w-5xl w-full mx-auto text-center text-xs text-[#73798C] dark:text-slate-500">
        AES-256-GCM Token Encryption · Scrypt Auth · CSRF Protected
      </footer>
    </div>
  );
}
