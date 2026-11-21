import React, { useRef, useState } from 'react';
import {
  Bot,
  Camera,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Send,
  Users,
  TerminalSquare,
  Grid2x2,
  Webhook,
  Code2,
  Sliders,
  ShieldCheck,
  Activity,
  Image as ImageIcon,
  Link2,
  Download,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { BotSummary, NavTab } from '../../types';
import { ConfirmDialog, EmptyState, Modal, StatusBadge } from '../ui/Primitives';

async function prepareBotAvatarJpegs(file: File): Promise<{ uploadDataUrl: string; thumbDataUrl: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode selected image.'));
      el.src = objectUrl;
    });

    const side = Math.max(1, Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const sx = Math.floor(((img.naturalWidth || img.width) - side) / 2);
    const sy = Math.floor(((img.naturalHeight || img.height) - side) / 2);

    const renderSquareJpeg = (size: number, quality: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable.');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      return canvas.toDataURL('image/jpeg', quality);
    };

    let uploadDataUrl = renderSquareJpeg(512, 0.88);
    if (uploadDataUrl.length > 450_000) {
      uploadDataUrl = renderSquareJpeg(512, 0.72);
    }

    let thumbDataUrl = renderSquareJpeg(128, 0.78);
    for (const q of [0.65, 0.52, 0.4]) {
      if (thumbDataUrl.length <= 55_000) break;
      thumbDataUrl = renderSquareJpeg(128, q);
    }

    return { uploadDataUrl, thumbDataUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function prepareDescriptionBannerJpeg(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode selected image.'));
      el.src = objectUrl;
    });

    const targetW = 640;
    const targetH = 360;
    const targetRatio = targetW / targetH;
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const srcRatio = srcW / Math.max(1, srcH);

    let sx = 0;
    let sy = 0;
    let sw = srcW;
    let sh = srcH;
    if (srcRatio > targetRatio) {
      sw = Math.floor(srcH * targetRatio);
      sx = Math.floor((srcW - sw) / 2);
    } else if (srcRatio < targetRatio) {
      sh = Math.floor(srcW / targetRatio);
      sy = Math.floor((srcH - sh) / 2);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.fillStyle = '#0B0F1A';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);

    let dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    for (const q of [0.74, 0.62, 0.5, 0.38]) {
      if (dataUrl.length <= 220_000) break;
      dataUrl = canvas.toDataURL('image/jpeg', q);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function BotAvatarBadge({ bot, size = 'md' }: { bot: BotSummary; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'w-9 h-9 text-xs' : size === 'lg' ? 'w-16 h-16 text-lg' : 'w-11 h-11 text-sm';
  const initials = (bot.name || bot.username || 'B')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

  if (bot.avatar_url) {
    return (
      <img
        src={bot.avatar_url}
        alt={`${bot.name} profile photo`}
        className={`${dim} rounded-full object-cover border border-[#E8EAF1] dark:border-slate-700 shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${dim} rounded-full bg-[#6555E8]/12 dark:bg-[#7565F6]/20 text-[#6555E8] dark:text-[#988DF9] font-display font-bold flex items-center justify-center border border-[#7565F6]/25 shrink-0`}
    >
      {initials || 'B'}
    </div>
  );
}

function TelegramIntroPreviewCard({
  bot,
  onEditClick,
}: {
  bot: BotSummary;
  onEditClick?: () => void;
}) {
  const menuBtn = bot.menu_button;
  const isWebApp = menuBtn?.type === 'web_app' && Boolean(menuBtn.url);
  const buttonLabel = isWebApp ? menuBtn?.text || 'Open' : menuBtn?.type === 'commands' ? 'Menu' : 'Default';

  return (
    <div className="rounded-2xl border border-[#E8EAF1] dark:border-slate-800 bg-[#F6F7FB] dark:bg-[#101421] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E8EAF1] dark:border-slate-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <BotAvatarBadge bot={bot} size="sm" />
          <div className="min-w-0">
            <div data-no-smallcaps="true" className="text-xs font-semibold truncate">
              {bot.name}
            </div>
            <div data-no-smallcaps="true" className="text-[11px] font-mono text-[#73798C] dark:text-slate-400 truncate">
              @{bot.username}
            </div>
          </div>
        </div>
        {onEditClick && (
          <button
            type="button"
            onClick={onEditClick}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#6555E8] dark:text-[#A599FF] bg-[#6555E8]/10 dark:bg-[#7565F6]/15 hover:bg-[#6555E8]/18 transition-colors shrink-0"
          >
            Edit Intro & Web Link
          </button>
        )}
      </div>

      <div className="p-4 flex flex-col items-center">
        <div className="w-full max-w-sm rounded-2xl overflow-hidden border border-[#E2E6F2] dark:border-slate-800 bg-white dark:bg-[#151B2B] shadow-sm">
          {bot.description_photo_url ? (
            <img
              src={bot.description_photo_url}
              alt={`${bot.name} What can this bot do banner`}
              className="w-full aspect-video object-cover bg-slate-900"
            />
          ) : (
            <div className="w-full aspect-video bg-gradient-to-br from-[#6555E8]/12 via-[#22C8F6]/8 to-transparent dark:from-[#7565F6]/18 dark:via-[#22C8F6]/10 flex flex-col items-center justify-center text-center px-4">
              <ImageIcon className="w-6 h-6 text-[#73798C] dark:text-slate-500 mb-1.5" />
              <div className="text-xs font-medium text-[#73798C] dark:text-slate-400">
                No &ldquo;What can this bot do?&rdquo; Picture Set
              </div>
              <div className="text-[10px] text-[#73798C] dark:text-slate-500 mt-0.5">
                Upload a 640×360 banner in Edit Profile
              </div>
            </div>
          )}
          <div className="p-3.5 space-y-2">
            {bot.short_description?.trim() && (
              <div className="pb-2 border-b border-[#E8EAF1] dark:border-slate-800/80 space-y-0.5">
                <div className="text-[11px] font-semibold text-[#73798C] dark:text-slate-400">About / Bio</div>
                <p data-no-smallcaps="true" className="text-xs text-[#171A2B] dark:text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
                  {bot.short_description.trim()}
                </p>
              </div>
            )}
            <div className="space-y-1">
              <div className="text-xs font-semibold text-[#171A2B] dark:text-slate-100">What can this bot do?</div>
              <p data-no-smallcaps="true" className="text-xs text-[#73798C] dark:text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                {bot.description?.trim() || 'No description text configured yet.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-2.5 border-t border-[#E8EAF1] dark:border-slate-800/80 bg-white/70 dark:bg-[#101421] flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 shrink-0 ${
              isWebApp
                ? 'bg-[#20C997]/15 text-[#118A66] dark:text-[#20C997] border border-[#20C997]/30'
                : 'bg-slate-200/70 dark:bg-slate-800 text-[#73798C] dark:text-slate-300'
            }`}
          >
            <Link2 className="w-3 h-3" />
            <span data-no-smallcaps="true">{buttonLabel}</span>
          </span>
          {isWebApp && menuBtn?.url ? (
            <a
              href={menuBtn.url}
              target="_blank"
              rel="noreferrer"
              data-no-smallcaps="true"
              className="font-mono text-[11px] text-[#6555E8] dark:text-[#A599FF] hover:underline truncate inline-flex items-center gap-1 min-w-0"
            >
              <span className="truncate">{menuBtn.url}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          ) : (
            <span className="text-[11px] text-[#73798C] dark:text-slate-400 truncate">
              {menuBtn?.type === 'commands' ? 'Showing bot commands menu' : 'No Web App link configured yet'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function AddBotModal({
  open,
  onClose,
  onBotAdded,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  onBotAdded: (bot: BotSummary) => void;
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}) {
  const [token, setToken] = useState('');
  const [customName, setCustomName] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    mode: 'live' | 'sandbox';
    token_masked: string;
    profile: {
      id: number;
      first_name: string;
      username: string;
      can_join_groups: boolean;
      supports_inline_queries: boolean;
    };
  } | null>(null);

  const reset = () => {
    setToken('');
    setCustomName('');
    setShortDesc('');
    setPreview(null);
    setError(null);
  };

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setValidating(true);
    try {
      const res = await apiFetch<typeof preview & { ok: boolean }>('/api/bots/validate-token', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      setPreview(res);
      if (!customName && res.profile?.first_name) {
        setCustomName(res.profile.first_name);
      }
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'Token validation failed.');
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await apiFetch<{ ok: boolean; bot: BotSummary }>('/api/bots', {
        method: 'POST',
        body: JSON.stringify({ token, name: customName, short_description: shortDesc }),
      });
      onToast('success', 'Bot Connected', `@${res.bot.username} encrypted with AES-256-GCM and saved.`);
      onBotAdded(res.bot);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save bot.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Connect Telegram Bot"
      subtitle="Tokens are validated via getMe and stored with server-side AES-256-GCM encryption"
    >
      <div className="space-y-4">
        {error && (
          <div role="alert" className="p-3 rounded-xl bg-[#F05B75]/10 border border-[#F05B75]/30 text-xs text-[#C72544] dark:text-[#F05B75]">
            {error}
          </div>
        )}

        <form onSubmit={handleValidate} className="space-y-3">
          <div>
            <label htmlFor="new-bot-token" className="block text-xs font-medium mb-1.5">
              Telegram Bot Token
            </label>
            <input
              id="new-bot-token"
              type="password"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setPreview(null);
              }}
              placeholder="123456789:AAH... or sandbox:my_test_bot"
              className="w-full px-3.5 py-2.5 min-h-[44px] text-sm font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
            />
            <p className="text-[11px] text-[#73798C] dark:text-slate-400 mt-1">
              Paste a live @BotFather token or use <code className="font-mono">sandbox:custom_name</code> to test locally without Telegram credentials.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={validating}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] hover:bg-[#5747d4] text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {validating ? 'Validating via getMe...' : 'Validate Token'}
            </button>
            <button
              type="button"
              onClick={() => {
                setToken(`sandbox:relay_${Math.floor(100 + Math.random() * 899)}`);
                setPreview(null);
                setError(null);
              }}
              className="px-3 py-2.5 min-h-[44px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Generate Sandbox Token
            </button>
          </div>
        </form>

        {preview && (
          <div className="p-4 rounded-xl bg-[#20C997]/8 border border-[#20C997]/30 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#118A66] dark:text-[#20C997]">
                <CheckCircle2 className="w-4 h-4" />
                <span>getMe Profile Verified ({preview.mode})</span>
              </div>
              <span className="font-mono text-[11px] text-[#73798C] dark:text-slate-400">{preview.token_masked}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[#73798C] dark:text-slate-400">Username:</span>{' '}
                <span data-no-smallcaps="true" className="font-mono font-medium">@{preview.profile.username}</span>
              </div>
              <div>
                <span className="text-[#73798C] dark:text-slate-400">Bot ID:</span>{' '}
                <span className="font-mono font-medium">{preview.profile.id}</span>
              </div>
            </div>

            <div>
              <label htmlFor="bot-display-name" className="block text-xs font-medium mb-1">
                Console Display Name
              </label>
              <input
                id="bot-display-name"
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full px-3 py-2 min-h-[40px] text-xs rounded-xl bg-white dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              />
            </div>

            <div>
              <label htmlFor="bot-short-desc" className="block text-xs font-medium mb-1">
                Notes / Short Description
              </label>
              <input
                id="bot-short-desc"
                type="text"
                value={shortDesc}
                onChange={(e) => setShortDesc(e.target.value)}
                placeholder="Production order alerts..."
                className="w-full px-3 py-2 min-h-[40px] text-xs rounded-xl bg-white dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              />
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#20C997] hover:bg-[#18b184] text-[#090B14] text-xs font-bold transition-colors disabled:opacity-50"
            >
              {saving ? 'Encrypting & Saving...' : 'Save & Connect Bot'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function BotsView({
  bots,
  activeBotId,
  onSelectBot,
  onNavigate,
  onOpenAddBot,
  onRefresh,
  onBotUpdated,
  onBotDeleted,
  onToast,
}: {
  bots: BotSummary[];
  activeBotId: number | null;
  onSelectBot: (id: number | null) => void;
  onNavigate: (tab: NavTab) => void;
  onOpenAddBot: () => void;
  onRefresh: () => void;
  onBotUpdated: (bot: BotSummary) => void;
  onBotDeleted: (botId: number) => void;
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}) {
  const selectedBot = bots.find((b) => b.id === activeBotId) || bots[0] || null;
  const [subTab, setSubTab] = useState<'overview' | 'edit' | 'settings'>('overview');
  const [editName, setEditName] = useState(selectedBot?.name || '');
  const [editShort, setEditShort] = useState(selectedBot?.short_description || '');
  const [editDescription, setEditDescription] = useState(selectedBot?.description || '');
  const [syncTelegram, setSyncTelegram] = useState(true);
  const [editStatus, setEditStatus] = useState<'connected' | 'disconnected'>(
    selectedBot?.connection_status === 'disconnected' ? 'disconnected' : 'connected'
  );
  const [parseMode, setParseMode] = useState<'HTML' | 'MarkdownV2' | 'None'>(
    selectedBot?.settings?.default_parse_mode || 'HTML'
  );
  const [disableNotif, setDisableNotif] = useState(Boolean(selectedBot?.settings?.disable_notification));
  const [protectContent, setProtectContent] = useState(Boolean(selectedBot?.settings?.protect_content));
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BotSummary | null>(null);
  const [menuButtonText, setMenuButtonText] = useState(selectedBot?.menu_button?.text || 'Open');
  const [menuButtonUrl, setMenuButtonUrl] = useState(selectedBot?.menu_button?.url || '');
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const descBannerInputRef = useRef<HTMLInputElement | null>(null);
  const prevBotIdRef = useRef<number | null>(selectedBot?.id ?? null);

  React.useEffect(() => {
    if (!selectedBot) {
      prevBotIdRef.current = null;
      return;
    }
    const switchedBot = prevBotIdRef.current !== selectedBot.id;
    prevBotIdRef.current = selectedBot.id;

    if (switchedBot) {
      setEditName(selectedBot.name);
      setEditShort(selectedBot.short_description || '');
      setEditDescription(selectedBot.description || '');
      setEditStatus(selectedBot.connection_status === 'disconnected' ? 'disconnected' : 'connected');
      setParseMode(selectedBot.settings?.default_parse_mode || 'HTML');
      setDisableNotif(Boolean(selectedBot.settings?.disable_notification));
      setProtectContent(Boolean(selectedBot.settings?.protect_content));
      setMenuButtonText(selectedBot.menu_button?.text || 'Open');
      setMenuButtonUrl(selectedBot.menu_button?.url || '');
    }
  }, [selectedBot]);

  React.useEffect(() => {
    if (!selectedBot) return;
    setParseMode(selectedBot.settings?.default_parse_mode || 'HTML');
    setDisableNotif(Boolean(selectedBot.settings?.disable_notification));
    setProtectContent(Boolean(selectedBot.settings?.protect_content));
  }, [
    selectedBot?.id,
    selectedBot?.settings?.default_parse_mode,
    selectedBot?.settings?.disable_notification,
    selectedBot?.settings?.protect_content,
  ]);

  const handleTestConnection = async (bot: BotSummary) => {
    setBusyAction('test');
    try {
      const res = await apiFetch<{ ok: boolean; durationMs: number; bot?: BotSummary }>(`/api/bots/${bot.id}/test-connection`, {
        method: 'POST',
      });
      if (res.bot) {
        onBotUpdated(res.bot);
      } else {
        onRefresh();
      }
      onToast(
        res.ok ? 'success' : 'error',
        res.ok ? 'Connection Healthy' : 'Connection Failed',
        `getMe responded in ${res.durationMs}ms`
      );
    } catch (err) {
      onToast('error', 'Test Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRevalidate = async (bot: BotSummary) => {
    setBusyAction('revalidate');
    try {
      const res = await apiFetch<{ ok: boolean; bot?: BotSummary }>(`/api/bots/${bot.id}/revalidate`, { method: 'POST' });
      if (res.bot) {
        onBotUpdated(res.bot);
        setEditName(res.bot.name);
        setEditShort(res.bot.short_description || '');
        setEditDescription(res.bot.description || '');
        setMenuButtonText(res.bot.menu_button?.text || 'Open');
        setMenuButtonUrl(res.bot.menu_button?.url || '');
      } else {
        onRefresh();
      }
      onToast('success', 'Token Revalidated', `@${bot.username} profile synced.`);
    } catch (err) {
      onToast('error', 'Revalidation Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBot) return;

    const currentMenuUrl = selectedBot.menu_button?.url || '';
    const currentMenuText = selectedBot.menu_button?.text || 'Open';
    const nextMenuUrl = menuButtonUrl.trim();
    const nextMenuText = menuButtonText.trim() || 'Open';
    const menuChanged =
      nextMenuUrl !== currentMenuUrl || (Boolean(nextMenuUrl) && nextMenuText !== currentMenuText);

    let menuPayload: { type: 'default' | 'web_app'; text?: string; url?: string } | undefined;
    if (menuChanged) {
      if (nextMenuUrl) {
        if (!/^https:\/\/.+/i.test(nextMenuUrl)) {
          onToast('error', 'Web App Link Failed', 'Telegram Web App URL must start with https://');
          return;
        }
        menuPayload = { type: 'web_app', text: nextMenuText, url: nextMenuUrl };
      } else if (currentMenuUrl) {
        menuPayload = { type: 'default' };
      }
    }

    setBusyAction('save');
    try {
      const res = await apiFetch<{ ok: boolean; syncedMethods?: string[]; bot: BotSummary }>(`/api/bots/${selectedBot.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName,
          short_description: editShort,
          description: editDescription,
          connection_status: editStatus,
          sync_telegram: syncTelegram,
          force_sync: syncTelegram,
          ...(menuPayload ? { menu_button: menuPayload } : {}),
        }),
      });
      if (res.bot) {
        onBotUpdated(res.bot);
        setEditName(res.bot.name);
        setEditShort(res.bot.short_description || '');
        setEditDescription(res.bot.description || '');
        setEditStatus(res.bot.connection_status === 'disconnected' ? 'disconnected' : 'connected');
        setMenuButtonText(res.bot.menu_button?.text || 'Open');
        setMenuButtonUrl(res.bot.menu_button?.url || '');
      } else {
        onRefresh();
      }
      onToast(
        'success',
        'Bot Profile Updated',
        res.syncedMethods?.length
          ? `Saved & synced with Telegram (${res.syncedMethods.join(', ')}).`
          : 'Configuration saved.'
      );
    } catch (err) {
      onToast('error', 'Update Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  const handlePullProfile = async () => {
    if (!selectedBot) return;
    setBusyAction('pull');
    try {
      const res = await apiFetch<{ ok: boolean; bot: BotSummary }>(`/api/bots/${selectedBot.id}/sync-profile`, {
        method: 'POST',
      });
      if (res.bot) {
        onBotUpdated(res.bot);
        setEditName(res.bot.name);
        setEditShort(res.bot.short_description || '');
        setEditDescription(res.bot.description || '');
        setMenuButtonText(res.bot.menu_button?.text || 'Open');
        setMenuButtonUrl(res.bot.menu_button?.url || '');
      } else {
        onRefresh();
      }
      onToast('success', 'Profile Synced', `Loaded current Name, Bio, Photo & Links for @${selectedBot.username}.`);
    } catch (err) {
      onToast('error', 'Sync Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedBot) return;
    if (!file.type.startsWith('image/')) {
      onToast('error', 'Invalid File', 'Please select a PNG, JPG, or WebP image file.');
      return;
    }
    setBusyAction('photo');
    try {
      const { uploadDataUrl, thumbDataUrl } = await prepareBotAvatarJpegs(file);
      const res = await apiFetch<{ ok: boolean; bot: BotSummary }>(`/api/bots/${selectedBot.id}/profile-photo`, {
        method: 'POST',
        body: JSON.stringify({ imageDataUrl: uploadDataUrl, thumbnailDataUrl: thumbDataUrl }),
      });
      if (res.bot) {
        onBotUpdated(res.bot);
      } else {
        onRefresh();
      }
      onToast('success', 'Profile Photo Updated', `New profile picture synced for @${selectedBot.username}.`);
    } catch (err) {
      onToast('error', 'Photo Update Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRemovePhoto = async () => {
    if (!selectedBot) return;
    setBusyAction('remove_photo');
    try {
      const res = await apiFetch<{ ok: boolean; bot: BotSummary }>(`/api/bots/${selectedBot.id}/profile-photo`, {
        method: 'DELETE',
      });
      if (res.bot) {
        onBotUpdated(res.bot);
      } else {
        onRefresh();
      }
      onToast('info', 'Profile Photo Removed', `Cleared Telegram profile picture for @${selectedBot.username}.`);
    } catch (err) {
      onToast('error', 'Remove Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDescBannerSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedBot) return;
    if (!file.type.startsWith('image/')) {
      onToast('error', 'Invalid File', 'Please select a PNG, JPG, or WebP image file.');
      return;
    }
    setBusyAction('desc_banner');
    try {
      const bannerDataUrl = await prepareDescriptionBannerJpeg(file);
      const res = await apiFetch<{ ok: boolean; bot: BotSummary }>(`/api/bots/${selectedBot.id}/description-photo`, {
        method: 'POST',
        body: JSON.stringify({ imageDataUrl: bannerDataUrl }),
      });
      if (res.bot) {
        onBotUpdated(res.bot);
      } else {
        onRefresh();
      }
      onToast(
        'success',
        'Description Picture Saved',
        '640×360 banner updated in preview. Download & send it to @BotFather (/setdescriptionpic) for Telegram.'
      );
    } catch (err) {
      onToast('error', 'Banner Upload Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRemoveDescBanner = async () => {
    if (!selectedBot) return;
    setBusyAction('remove_desc_banner');
    try {
      const res = await apiFetch<{ ok: boolean; bot?: BotSummary }>(`/api/bots/${selectedBot.id}/description-photo`, { method: 'DELETE' });
      if (res.bot) {
        onBotUpdated(res.bot);
      } else {
        onRefresh();
      }
      onToast('info', 'Description Picture Removed', `Cleared 640×360 banner for @${selectedBot.username}.`);
    } catch (err) {
      onToast('error', 'Remove Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadDescBanner = () => {
    if (!selectedBot?.description_photo_url) return;
    const a = document.createElement('a');
    a.href = selectedBot.description_photo_url;
    a.download = `${selectedBot.username}_description_640x360.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleSaveMenuButton = async () => {
    if (!selectedBot) return;
    setBusyAction('menu_button');
    try {
      const res = await apiFetch<{ ok: boolean; menu_button: { type: string; text?: string; url?: string }; bot?: BotSummary }>(
        `/api/bots/${selectedBot.id}/menu-button`,
        {
          method: 'PUT',
          body: JSON.stringify({
            type: 'web_app',
            text: menuButtonText.trim() || 'Open',
            url: menuButtonUrl.trim(),
          }),
        }
      );
      if (res.bot) {
        onBotUpdated(res.bot);
      } else {
        onRefresh();
      }
      setMenuButtonText(res.menu_button?.text || 'Open');
      setMenuButtonUrl(res.menu_button?.url || '');
      onToast(
        'success',
        'Web App Link Updated',
        `Menu button "${res.menu_button.text || 'Open'}" synced via setChatMenuButton.`
      );
    } catch (err) {
      onToast('error', 'Web App Link Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  const handlePullMenuButton = async () => {
    if (!selectedBot) return;
    setBusyAction('pull_menu_button');
    try {
      const res = await apiFetch<{ ok: boolean; menu_button: { type: string; text?: string; url?: string }; bot?: BotSummary }>(
        `/api/bots/${selectedBot.id}/menu-button`
      );
      if (res.bot) {
        onBotUpdated(res.bot);
      } else {
        onRefresh();
      }
      setMenuButtonText(res.menu_button?.text || 'Open');
      setMenuButtonUrl(res.menu_button?.url || '');
      onToast(
        'success',
        'Web App Link Synced',
        res.menu_button?.type === 'web_app' && res.menu_button.url
          ? `Current link: ${res.menu_button.url}`
          : `Menu mode is currently "${res.menu_button?.type || 'default'}".`
      );
    } catch (err) {
      onToast('error', 'Pull Link Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  const handleResetMenuButton = async () => {
    if (!selectedBot) return;
    setBusyAction('reset_menu_button');
    try {
      const res = await apiFetch<{ ok: boolean; bot?: BotSummary }>(`/api/bots/${selectedBot.id}/menu-button`, {
        method: 'PUT',
        body: JSON.stringify({ type: 'default' }),
      });
      if (res.bot) {
        onBotUpdated(res.bot);
      } else {
        onRefresh();
      }
      setMenuButtonText('Open');
      setMenuButtonUrl('');
      onToast('info', 'Menu Button Reset', `Restored default Telegram menu button for @${selectedBot.username}.`);
    } catch (err) {
      onToast('error', 'Reset Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBot) return;
    setBusyAction('settings');
    try {
      await apiFetch(`/api/bots/${selectedBot.id}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          default_parse_mode: parseMode,
          disable_notification: disableNotif,
          protect_content: protectContent,
        }),
      });
      onToast('success', 'Settings Saved', `Default parse mode: ${parseMode}`);
      onRefresh();
    } catch (err) {
      onToast('error', 'Save Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    const targetUsername = deleteTarget.username;
    setBusyAction('delete');
    try {
      await apiFetch(`/api/bots/${targetId}`, { method: 'DELETE' });
      onBotDeleted(targetId);
      setDeleteTarget(null);
      onToast('info', 'Bot Removed', `@${targetUsername} and its encrypted credentials were removed.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('not found')) {
        onBotDeleted(targetId);
        setDeleteTarget(null);
        onToast('info', 'Bot Removed', `@${targetUsername} is no longer in your connected fleet.`);
      } else {
        onToast('error', 'Delete Failed', msg || undefined);
      }
    } finally {
      setBusyAction(null);
    }
  };

  if (bots.length === 0) {
    return (
      <EmptyState
        icon={Bot}
        title="No Telegram Bots Connected"
        description="Connect your first Telegram bot token (live or sandbox) to manage messages, commands, webhooks, and analytics."
        actionLabel="Connect First Bot"
        onAction={onOpenAddBot}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Left Bot List */}
      <div className="lg:col-span-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Connected Fleet ({bots.length})</h2>
          <button
            type="button"
            onClick={onOpenAddBot}
            className="px-3 py-1.5 min-h-[36px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] text-white text-xs font-medium inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Bot</span>
          </button>
        </div>

        <div className="space-y-2.5">
          {bots.map((b) => {
            const isSelected = selectedBot?.id === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onSelectBot(b.id)}
                className={`w-full text-left p-4 rounded-2xl border transition-colors ${
                  isSelected
                    ? 'bg-white dark:bg-[#151B2B] border-[#7565F6]'
                    : 'bg-white dark:bg-[#151B2B] border-[#E8EAF1] dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <BotAvatarBadge bot={b} size="sm" />
                    <div className="min-w-0">
                      <div data-no-smallcaps="true" className="text-sm font-semibold truncate">{b.name}</div>
                      <div className="text-xs font-mono text-[#73798C] dark:text-slate-400 truncate">
                        <span data-no-smallcaps="true">@{b.username}</span> · {b.mode}
                      </div>
                    </div>
                  </div>
                  <StatusBadge
                    status={b.connection_status === 'connected' ? 'success' : b.connection_status === 'disconnected' ? 'neutral' : 'danger'}
                    label={b.connection_status}
                  />
                </div>
                <div className="mt-3 flex items-center gap-3 text-[11px] font-mono tabular-nums text-[#73798C] dark:text-slate-400">
                  <span>{b.counts?.chats ?? 0} chats</span>
                  <span>·</span>
                  <span>{b.counts?.messages ?? 0} msgs</span>
                  <span>·</span>
                  <span>{b.counts?.updates ?? 0} updates</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Individual Bot Management Workspace */}
      {selectedBot && (
        <div className="lg:col-span-8 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E8EAF1] dark:border-slate-800">
            <div className="flex items-center gap-3 min-w-0">
              <BotAvatarBadge bot={selectedBot} size="md" />
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 data-no-smallcaps="true" className="text-lg font-display font-bold truncate">{selectedBot.name}</h2>
                  <StatusBadge
                    status={selectedBot.connection_status === 'connected' ? 'success' : 'warning'}
                    label={selectedBot.connection_status}
                  />
                </div>
                <div className="text-xs font-mono text-[#73798C] dark:text-slate-400 mt-1 truncate">
                  <span data-no-smallcaps="true">@{selectedBot.username}</span> · ID {selectedBot.telegram_bot_id} · Token {selectedBot.token_masked}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => handleTestConnection(selectedBot)}
                className="px-3 py-2 min-h-[40px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>{busyAction === 'test' ? 'Testing...' : 'Test Connection'}</span>
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => handleRevalidate(selectedBot)}
                className="px-3 py-2 min-h-[40px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'revalidate' ? 'animate-spin' : ''}`} />
                <span>Revalidate</span>
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(selectedBot)}
                aria-label={`Remove ${selectedBot.name}`}
                className="px-3 py-2 min-h-[40px] rounded-xl border border-[#F05B75]/30 text-[#F05B75] hover:bg-[#F05B75]/10 text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            </div>
          </div>

          {/* Workspace Tabs */}
          <div className="flex items-center gap-1 p-1 bg-[#F6F7FB] dark:bg-[#101421] rounded-xl w-fit">
            {[
              { id: 'overview' as const, label: 'Overview & Modules' },
              { id: 'edit' as const, label: 'Edit Profile' },
              { id: 'settings' as const, label: 'Bot Defaults' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  subTab === t.id
                    ? 'bg-white dark:bg-[#151B2B] text-[#171A2B] dark:text-white shadow-xs'
                    : 'text-[#73798C] dark:text-slate-400 hover:text-[#171A2B] dark:hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {subTab === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800">
                  <div className="text-[#73798C] dark:text-slate-400">Webhook Status</div>
                  <div className="font-semibold mt-1 capitalize">{selectedBot.webhook_status}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800">
                  <div className="text-[#73798C] dark:text-slate-400">Join Groups</div>
                  <div className="font-semibold mt-1">{selectedBot.can_join_groups ? 'Allowed' : 'Disabled'}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800">
                  <div className="text-[#73798C] dark:text-slate-400">Inline Queries</div>
                  <div className="font-semibold mt-1">{selectedBot.supports_inline_queries ? 'Enabled' : 'Off'}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800">
                  <div className="text-[#73798C] dark:text-slate-400">Encryption</div>
                  <div className="font-semibold mt-1 inline-flex items-center gap-1 text-[#20C997]">
                    <ShieldCheck className="w-3.5 h-3.5" /> AES-256-GCM
                  </div>
                </div>
              </div>

              <TelegramIntroPreviewCard bot={selectedBot} onEditClick={() => setSubTab('edit')} />

              <div>
                <h3 className="text-xs font-semibold text-[#73798C] dark:text-slate-400 mb-2.5">
                  Operate <span data-no-smallcaps="true">@{selectedBot.username}</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    { tab: 'messages' as NavTab, label: 'Send Message', icon: Send },
                    { tab: 'chats' as NavTab, label: 'Known Chats', icon: Users },
                    { tab: 'commands' as NavTab, label: 'Bot Commands', icon: TerminalSquare },
                    { tab: 'keyboards' as NavTab, label: 'Keyboards', icon: Grid2x2 },
                    { tab: 'webhooks' as NavTab, label: 'Webhook & Updates', icon: Webhook },
                    { tab: 'explorer' as NavTab, label: 'API Explorer', icon: Code2 },
                  ].map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.tab}
                        type="button"
                        onClick={() => {
                          onSelectBot(selectedBot.id);
                          onNavigate(m.tab);
                        }}
                        className="flex items-center gap-2.5 p-3 min-h-[48px] rounded-xl border border-[#E8EAF1] dark:border-slate-800 hover:border-[#7565F6] hover:bg-[#7565F6]/5 text-xs font-medium transition-colors"
                      >
                        <Icon className="w-4 h-4 text-[#6555E8] dark:text-[#988DF9] shrink-0" />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {subTab === 'edit' && (
            <div className="space-y-5 max-w-2xl">
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="p-4 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <BotAvatarBadge bot={selectedBot} size="lg" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold">Bot Profile Picture</div>
                      <p className="text-[11px] text-[#73798C] dark:text-slate-400 mt-0.5">
                        Auto-fetched from Telegram on connect/pull and synced via <code className="font-mono">setMyProfilePhoto</code>.
                      </p>
                    </div>
                  </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    aria-label="Upload bot profile photo"
                    onChange={handlePhotoSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => photoInputRef.current?.click()}
                    className="px-3 py-2 min-h-[38px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] hover:bg-[#5747d4] text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{busyAction === 'photo' ? 'Uploading...' : 'Change Photo'}</span>
                  </button>
                  {selectedBot.avatar_url && (
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={handleRemovePhoto}
                      aria-label="Remove bot profile photo"
                      className="px-3 py-2 min-h-[38px] rounded-xl border border-[#F05B75]/30 text-[#F05B75] hover:bg-[#F05B75]/10 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{busyAction === 'remove_photo' ? 'Removing...' : 'Remove Photo'}</span>
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="edit-bot-name" className="block text-xs font-medium">
                    Bot Name
                  </label>
                  <span className="text-[11px] font-mono text-[#73798C] dark:text-slate-400">
                    {editName.length}/64
                  </span>
                </div>
                <input
                  id="edit-bot-name"
                  type="text"
                  required
                  maxLength={64}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="edit-bot-bio" className="block text-xs font-medium">
                    Bot Bio (Short Description)
                  </label>
                  <span className="text-[11px] font-mono text-[#73798C] dark:text-slate-400">
                    {editShort.length}/120
                  </span>
                </div>
                <input
                  id="edit-bot-bio"
                  type="text"
                  maxLength={120}
                  value={editShort}
                  onChange={(e) => setEditShort(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
                />
                <p className="text-[11px] text-[#73798C] dark:text-slate-400 mt-1">
                  Shown on your bot's Telegram profile page (About / Bio).
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="edit-bot-description" className="block text-xs font-medium">
                    Bot Description (What can this bot do?)
                  </label>
                  <span className="text-[11px] font-mono text-[#73798C] dark:text-slate-400">
                    {editDescription.length}/512
                  </span>
                </div>
                <textarea
                  id="edit-bot-description"
                  rows={3}
                  maxLength={512}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
                />
              </div>

              <div>
                <label htmlFor="edit-bot-status" className="block text-xs font-medium mb-1">
                  Operational Status
                </label>
                <select
                  id="edit-bot-status"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as 'connected' | 'disconnected')}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                >
                  <option value="connected">Connected (Active)</option>
                  <option value="disconnected">Disconnected (Paused)</option>
                </select>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-[#73798C] dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={syncTelegram}
                  onChange={(e) => setSyncTelegram(e.target.checked)}
                />
                <span>Sync Name, Bio & Description directly with Telegram Bot API</span>
              </label>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="submit"
                  disabled={busyAction !== null}
                  className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] hover:bg-[#5747d4] text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {busyAction === 'save' ? 'Saving & Syncing...' : 'Save Bot Profile'}
                </button>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handlePullProfile}
                  className="px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'pull' ? 'animate-spin' : ''}`} />
                  <span>{busyAction === 'pull' ? 'Syncing...' : 'Pull from Telegram'}</span>
                </button>
              </div>
            </form>

            {/* "What can this bot do?" 640x360 Description Picture */}
            <div className="p-4 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-[#7565F6]" />
                    <span>&ldquo;What can this bot do?&rdquo; Picture (640×360 Banner)</span>
                  </h3>
                  <p className="text-[11px] text-[#73798C] dark:text-slate-400 mt-0.5">
                    View and update the empty-chat intro banner. Automatically cropped &amp; resized to Telegram&apos;s exact 640×360 spec.
                  </p>
                </div>
                <input
                  ref={descBannerInputRef}
                  type="file"
                  accept="image/*"
                  aria-label="Upload What can this bot do banner picture"
                  onChange={handleDescBannerSelected}
                  className="hidden"
                />
              </div>

              {selectedBot.description_photo_url ? (
                <div className="rounded-xl overflow-hidden border border-[#E8EAF1] dark:border-slate-800 bg-slate-950 max-w-md">
                  <img
                    src={selectedBot.description_photo_url}
                    alt={`${selectedBot.name} description banner`}
                    className="w-full aspect-video object-cover"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#D3D8EB] dark:border-slate-700 p-5 text-center max-w-md">
                  <ImageIcon className="w-6 h-6 mx-auto text-[#73798C] dark:text-slate-500 mb-1" />
                  <div className="text-xs font-medium text-[#73798C] dark:text-slate-400">No description banner uploaded yet</div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => descBannerInputRef.current?.click()}
                  className="px-3 py-2 min-h-[38px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] hover:bg-[#5747d4] text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>{busyAction === 'desc_banner' ? 'Saving 640×360...' : selectedBot.description_photo_url ? 'Change Banner' : 'Upload Banner'}</span>
                </button>
                {selectedBot.description_photo_url && (
                  <>
                    <button
                      type="button"
                      onClick={handleDownloadDescBanner}
                      className="px-3 py-2 min-h-[38px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download 640×360 for @BotFather</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={handleRemoveDescBanner}
                      className="px-3 py-2 min-h-[38px] rounded-xl border border-[#F05B75]/30 text-[#F05B75] hover:bg-[#F05B75]/10 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{busyAction === 'remove_desc_banner' ? 'Removing...' : 'Remove Banner'}</span>
                    </button>
                  </>
                )}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 min-h-[38px] rounded-xl border border-[#7565F6]/30 text-[#6555E8] dark:text-[#A599FF] hover:bg-[#7565F6]/10 text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open @BotFather</span>
                </a>
              </div>

              <p className="text-[11px] text-[#73798C] dark:text-slate-400 leading-relaxed">
                Note: Telegram&apos;s Bot API only allows changing the circular Bot Profile Picture (<code className="font-mono">setMyProfilePhoto</code>), Name, Bio &amp; Description directly; the &ldquo;What can this bot do?&rdquo; banner image must be uploaded via <span data-no-smallcaps="true" className="font-mono">@BotFather</span> (<code className="font-mono">/setdescriptionpic</code>). Saving here updates your console preview right away and exports the exact 640×360 JPEG for <span data-no-smallcaps="true" className="font-mono">@BotFather</span>.
              </p>
            </div>

            {/* Bot Web App Link (Open Menu Button via getChatMenuButton / setChatMenuButton) */}
            <div className="p-4 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-[#20C997]" />
                    <span>Bot Web App Link (Open Menu Button)</span>
                  </h3>
                  <p className="text-[11px] text-[#73798C] dark:text-slate-400 mt-0.5">
                    View and update the bottom-left Web App button shown inside Telegram chats (<code className="font-mono">setChatMenuButton</code>).
                  </p>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-white/80 dark:bg-[#151B2B]/80 border border-[#E8EAF1] dark:border-slate-800 text-xs flex flex-wrap items-center gap-2">
                <span className="text-[#73798C] dark:text-slate-400">Current Link:</span>
                {selectedBot.menu_button?.type === 'web_app' && selectedBot.menu_button.url ? (
                  <a
                    href={selectedBot.menu_button.url}
                    target="_blank"
                    rel="noreferrer"
                    data-no-smallcaps="true"
                    className="font-mono text-[#6555E8] dark:text-[#A599FF] hover:underline break-all inline-flex items-center gap-1"
                  >
                    <span>{selectedBot.menu_button.url}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ) : (
                  <span className="font-mono text-[#73798C] dark:text-slate-400">
                    {selectedBot.menu_button?.type === 'commands' ? 'Commands Menu (no Web App link)' : 'Default (no Web App link set)'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="edit-menu-btn-text" className="block text-xs font-medium mb-1">
                    Button Text
                  </label>
                  <input
                    id="edit-menu-btn-text"
                    type="text"
                    maxLength={64}
                    value={menuButtonText}
                    onChange={(e) => setMenuButtonText(e.target.value)}
                    placeholder="Open"
                    className="w-full px-3 py-2 min-h-[42px] text-sm rounded-xl bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="edit-menu-btn-url" className="block text-xs font-medium mb-1">
                    Web App HTTPS URL
                  </label>
                  <input
                    id="edit-menu-btn-url"
                    type="url"
                    value={menuButtonUrl}
                    onChange={(e) => setMenuButtonUrl(e.target.value)}
                    placeholder="https://your-webapp.example.com"
                    className="w-full px-3 py-2 min-h-[42px] text-sm font-mono rounded-xl bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleSaveMenuButton}
                  className="px-3.5 py-2 min-h-[40px] rounded-xl bg-[#20C997] hover:bg-[#18b184] text-[#090B14] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>{busyAction === 'menu_button' ? 'Saving Link...' : 'Save Web App Link'}</span>
                </button>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handlePullMenuButton}
                  className="px-3 py-2 min-h-[40px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'pull_menu_button' ? 'animate-spin' : ''}`} />
                  <span>Pull Current Link</span>
                </button>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleResetMenuButton}
                  className="px-3 py-2 min-h-[40px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset to Default</span>
                </button>
              </div>
            </div>
          </div>
          )}

          {subTab === 'settings' && (
            <form onSubmit={handleSaveSettings} className="space-y-4 max-w-lg">
              <div>
                <label className="block text-xs font-medium mb-1">Default Parse Mode</label>
                <select
                  value={parseMode}
                  onChange={(e) => setParseMode(e.target.value as 'HTML' | 'MarkdownV2' | 'None')}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                >
                  <option value="HTML">HTML</option>
                  <option value="MarkdownV2">MarkdownV2</option>
                  <option value="None">Plain Text</option>
                </select>
              </div>
              <label className="flex items-center gap-2.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={disableNotif}
                  onChange={(e) => setDisableNotif(e.target.checked)}
                />
                <span>Disable notifications silently by default</span>
              </label>
              <label className="flex items-center gap-2.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={protectContent}
                  onChange={(e) => setProtectContent(e.target.checked)}
                />
                <span>Protect outgoing message content from forwarding</span>
              </label>
              <button
                type="submit"
                disabled={busyAction === 'settings'}
                className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{busyAction === 'settings' ? 'Saving...' : 'Save Bot Defaults'}</span>
              </button>
            </form>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        danger
        loading={busyAction === 'delete'}
        title={`Remove @${deleteTarget?.username}?`}
        message="This removes the bot, its encrypted token, chats, commands, and update history from XC BOT CONTROL."
        confirmLabel="Remove Bot"
      />
    </div>
  );
}
