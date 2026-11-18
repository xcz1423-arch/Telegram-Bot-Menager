import React, { useEffect, useState } from 'react';
import { Users, Search, Send, Trash2, PlusCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { BotChat, BotSummary } from '../../types';
import { EmptyState, StatusBadge } from '../ui/Primitives';

export function ChatManagerView({
  bots,
  activeBotId,
  onSelectBot,
  onSendMessageToChat,
  onToast,
}: {
  bots: BotSummary[];
  activeBotId: number | null;
  onSelectBot: (id: number) => void;
  onSendMessageToChat: (botId: number, chatId: string) => void;
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}) {
  const bot = bots.find((b) => b.id === activeBotId) || bots[0] || null;
  const [chats, setChats] = useState<BotChat[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [lookupId, setLookupId] = useState('');
  const [loading, setLoading] = useState(false);

  const loadChats = async () => {
    if (!bot) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (query.trim()) params.set('q', query.trim());
      const res = await apiFetch<{ chats: BotChat[] }>(`/api/bots/${bot.id}/chats?${params.toString()}`);
      setChats(res.chats);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChats();
  }, [bot?.id, typeFilter, query]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bot || !lookupId.trim()) return;
    try {
      await apiFetch(`/api/bots/${bot.id}/chats/lookup`, {
        method: 'POST',
        body: JSON.stringify({ chatId: lookupId.trim() }),
      });
      onToast('success', 'Chat Synced', `getChat succeeded for ${lookupId.trim()}.`);
      setLookupId('');
      loadChats();
    } catch (err) {
      onToast('error', 'Chat Lookup Failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    if (!bot) return;
    await apiFetch(`/api/bots/${bot.id}/chats/${encodeURIComponent(chatId)}`, { method: 'DELETE' });
    onToast('info', 'Chat Removed', `Removed ${chatId} from known directory.`);
    loadChats();
  };

  if (!bot) {
    return (
      <EmptyState
        icon={Users}
        title="No Connected Bot"
        description="Connect a bot to inspect known chats discovered via updates and Bot API calls."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Select Bot"
              value={bot.id}
              onChange={(e) => onSelectBot(Number(e.target.value))}
              className="px-3 py-2 min-h-[44px] text-xs font-medium rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
            >
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  @{b.username}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F6F7FB] dark:bg-[#101421]">
              {['all', 'private', 'group', 'supergroup', 'channel'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`px-2.5 py-1.5 min-h-[34px] text-xs font-medium rounded-lg capitalize transition-colors ${
                    typeFilter === t
                      ? 'bg-white dark:bg-[#151B2B] text-[#171A2B] dark:text-white shadow-xs'
                      : 'text-[#73798C] dark:text-slate-400'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleLookup} className="flex items-center gap-2">
            <input
              type="text"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder="Sync chat ID or @channel via getChat..."
              className="flex-1 sm:w-64 px-3 py-2 min-h-[44px] text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
            />
            <button
              type="submit"
              className="px-3.5 py-2 min-h-[44px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Lookup</span>
            </button>
          </form>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-[#73798C] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter known chats by ID, title, @username, or name..."
            className="w-full pl-10 pr-4 py-2.5 min-h-[44px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
          />
        </div>
      </div>

      {chats.length === 0 && !loading ? (
        <EmptyState
          icon={Users}
          title="No Known Chats Matched"
          description="Known chats are discovered automatically when Telegram sends updates to your webhook or when you look up a chat via getChat."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {chats.map((c) => {
            const label = c.title || [c.first_name, c.last_name].filter(Boolean).join(' ') || `@${c.username}` || c.chat_id;
            return (
              <div
                key={c.id}
                className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{label}</div>
                    <div className="text-xs font-mono text-[#73798C] dark:text-slate-400 truncate mt-0.5">
                      ID: {c.chat_id} {c.username ? `· @${c.username}` : ''}
                    </div>
                  </div>
                  <StatusBadge status="accent" label={c.chat_type} />
                </div>

                <div className="pt-3 border-t border-[#E8EAF1] dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-[11px] font-mono text-[#73798C] dark:text-slate-400">
                    {c.member_count ? `${c.member_count} members` : c.last_interaction_at.slice(0, 10)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSendMessageToChat(bot.id, c.chat_id)}
                      className="px-3 py-1.5 min-h-[36px] rounded-lg bg-[#6555E8] dark:bg-[#7565F6] text-white text-xs font-medium inline-flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      <span>Message</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteChat(c.chat_id)}
                      aria-label={`Remove chat ${label}`}
                      className="p-2 min-h-[36px] min-w-[36px] rounded-lg text-[#F05B75] hover:bg-[#F05B75]/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
