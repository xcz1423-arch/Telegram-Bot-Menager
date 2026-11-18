import React, { useEffect, useState } from 'react';
import { TerminalSquare, Plus, Trash2, UploadCloud, DownloadCloud } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { validateCommandDescription, validateCommandName } from '../../lib/telegramSpec';
import type { BotCommand, BotSummary } from '../../types';
import { EmptyState } from '../ui/Primitives';

export function CommandManagerView({
  bots,
  activeBotId,
  onSelectBot,
  onToast,
}: {
  bots: BotSummary[];
  activeBotId: number | null;
  onSelectBot: (id: number) => void;
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}) {
  const bot = bots.find((b) => b.id === activeBotId) || bots[0] || null;
  const [scopeType, setScopeType] = useState('default');
  const [languageCode, setLanguageCode] = useState('');
  const [commands, setCommands] = useState<BotCommand[]>([]);
  const [newCmd, setNewCmd] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [syncing, setSyncing] = useState(false);

  const loadCommands = async () => {
    if (!bot) return;
    const res = await apiFetch<{ commands: BotCommand[] }>(
      `/api/bots/${bot.id}/commands?scope=${encodeURIComponent(scopeType)}&lang=${encodeURIComponent(languageCode)}`
    );
    setCommands(res.commands);
  };

  useEffect(() => {
    loadCommands();
  }, [bot?.id, scopeType, languageCode]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const cmdCheck = validateCommandName(newCmd);
    if (!cmdCheck.valid) {
      onToast('error', 'Invalid Command', cmdCheck.error);
      return;
    }
    const descCheck = validateCommandDescription(newDesc);
    if (!descCheck.valid) {
      onToast('error', 'Invalid Description', descCheck.error);
      return;
    }
    if (commands.some((c) => c.command === cmdCheck.normalized)) {
      onToast('error', 'Duplicate Command', `/${cmdCheck.normalized} is already in this scope.`);
      return;
    }
    setCommands([...commands, { command: cmdCheck.normalized, description: newDesc.trim() }]);
    setNewCmd('');
    setNewDesc('');
  };

  const handleSyncToTelegram = async () => {
    if (!bot) return;
    setSyncing(true);
    try {
      await apiFetch(`/api/bots/${bot.id}/commands/sync`, {
        method: 'POST',
        body: JSON.stringify({ scopeType, languageCode, commands }),
      });
      onToast('success', 'Commands Synchronized', `${commands.length} commands pushed via setMyCommands.`);
    } catch (err) {
      onToast('error', 'Sync Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSyncing(false);
    }
  };

  const handlePullFromTelegram = async () => {
    if (!bot) return;
    setSyncing(true);
    try {
      const res = await apiFetch<{ commands: BotCommand[] }>(`/api/bots/${bot.id}/commands/pull`, {
        method: 'POST',
        body: JSON.stringify({ scopeType, languageCode }),
      });
      setCommands(res.commands);
      onToast('info', 'Pulled from Telegram', `Loaded ${res.commands.length} commands via getMyCommands.`);
    } catch (err) {
      onToast('error', 'Pull Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSyncing(false);
    }
  };

  if (!bot) {
    return (
      <EmptyState
        icon={TerminalSquare}
        title="No Connected Bot"
        description="Connect a bot to configure slash commands and synchronize scopes with Telegram."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className="lg:col-span-7 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Bot</label>
            <select
              value={bot.id}
              onChange={(e) => onSelectBot(Number(e.target.value))}
              className="w-full px-3 py-2 min-h-[44px] text-xs font-medium rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
            >
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  @{b.username}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Command Scope</label>
            <select
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value)}
              className="w-full px-3 py-2 min-h-[44px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
            >
              <option value="default">Default (All Users)</option>
              <option value="all_private_chats">All Private Chats</option>
              <option value="all_group_chats">All Group Chats</option>
              <option value="all_chat_administrators">All Chat Admins</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Language (ISO 639-1)</label>
            <input
              type="text"
              maxLength={2}
              value={languageCode}
              onChange={(e) => setLanguageCode(e.target.value.toLowerCase())}
              placeholder="All (empty) or en"
              className="w-full px-3 py-2 min-h-[44px] text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
            />
          </div>
        </div>

        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-2 border-t border-[#E8EAF1] dark:border-slate-800">
          <input
            type="text"
            value={newCmd}
            onChange={(e) => setNewCmd(e.target.value)}
            placeholder="status"
            aria-label="Command name"
            className="sm:col-span-4 px-3 py-2 min-h-[44px] text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
          />
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Command description (3-256 chars)"
            aria-label="Command description"
            className="sm:col-span-6 px-3 py-2 min-h-[44px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
          />
          <button
            type="submit"
            className="sm:col-span-2 min-h-[44px] px-3 rounded-xl bg-[#6555E8] dark:bg-[#7565F6] text-white text-xs font-medium inline-flex items-center justify-center gap-1"
          >
            <Plus className="w-4 h-4" />
            <span>Add</span>
          </button>
        </form>

        <div className="space-y-2">
          {commands.length === 0 ? (
            <p className="text-xs text-[#73798C] dark:text-slate-400 py-4 text-center">
              No commands defined in this scope.
            </p>
          ) : (
            commands.map((c, idx) => (
              <div
                key={`${c.command}-${idx}`}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              >
                <div className="min-w-0">
                  <div className="text-xs font-mono font-semibold text-[#6555E8] dark:text-[#988DF9]">/{c.command}</div>
                  <div className="text-xs text-[#73798C] dark:text-slate-300 truncate">{c.description}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setCommands(commands.filter((_, i) => i !== idx))}
                  aria-label={`Delete command ${c.command}`}
                  className="p-2 min-h-[36px] min-w-[36px] rounded-lg text-[#F05B75] hover:bg-[#F05B75]/10 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#E8EAF1] dark:border-slate-800">
          <button
            type="button"
            disabled={syncing}
            onClick={handlePullFromTelegram}
            className="px-4 py-2.5 min-h-[44px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5"
          >
            <DownloadCloud className="w-4 h-4" />
            <span>Pull (getMyCommands)</span>
          </button>
          <button
            type="button"
            disabled={syncing}
            onClick={handleSyncToTelegram}
            className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#20C997] hover:bg-[#18b184] text-[#090B14] text-xs font-bold inline-flex items-center gap-1.5"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{syncing ? 'Syncing...' : 'Sync to Telegram'}</span>
          </button>
        </div>
      </div>

      {/* Live Menu Preview */}
      <div className="lg:col-span-5 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-6">
        <h3 className="text-sm font-semibold mb-1">Telegram Slash Menu Preview</h3>
        <p className="text-xs text-[#73798C] dark:text-slate-400 mb-4">
          Scope: <span className="font-mono">{scopeType}</span> {languageCode ? `(${languageCode})` : ''}
        </p>

        <div className="rounded-2xl bg-[#0F172A] border border-slate-800 p-3 space-y-1">
          {commands.length === 0 ? (
            <div className="text-xs text-slate-400 py-8 text-center">Command menu is empty</div>
          ) : (
            commands.map((c, idx) => (
              <div key={idx} className="px-3 py-2 rounded-xl hover:bg-slate-800/70 flex items-baseline gap-3 text-xs">
                <span className="font-mono font-semibold text-[#22C8F6] shrink-0">/{c.command}</span>
                <span className="text-slate-300 truncate">{c.description}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
