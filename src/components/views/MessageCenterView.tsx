import React, { useEffect, useState } from 'react';
import {
  Send,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  FileCode,
  Link as LinkIcon,
  CheckCircle2,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { BotChat, BotMessage, BotSummary, KeyboardTemplate } from '../../types';
import { CopyButton, EmptyState, Modal, StatusBadge } from '../ui/Primitives';

const MESSAGE_TYPES = [
  { id: 'text', label: 'Text' },
  { id: 'photo', label: 'Photo' },
  { id: 'video', label: 'Video' },
  { id: 'document', label: 'Document' },
  { id: 'audio', label: 'Audio' },
  { id: 'voice', label: 'Voice' },
  { id: 'animation', label: 'Animation' },
  { id: 'location', label: 'Location' },
  { id: 'contact', label: 'Contact' },
  { id: 'poll', label: 'Poll' },
  { id: 'media_group', label: 'Media Group' },
] as const;

export function MessageCenterView({
  bots,
  activeBotId,
  initialChatId,
  initialReplyMarkup,
  onSelectBot,
  onRefreshDashboard,
  onToast,
}: {
  bots: BotSummary[];
  activeBotId: number | null;
  initialChatId?: string;
  initialReplyMarkup?: string;
  onSelectBot: (id: number) => void;
  onRefreshDashboard: () => void;
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}) {
  const bot = bots.find((b) => b.id === activeBotId) || bots[0] || null;

  const [chats, setChats] = useState<BotChat[]>([]);
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [templates, setTemplates] = useState<KeyboardTemplate[]>([]);

  const [messageType, setMessageType] = useState<string>('text');
  const [chatId, setChatId] = useState(initialChatId || '');
  const [parseMode, setParseMode] = useState<'HTML' | 'MarkdownV2' | 'None'>('HTML');
  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [latitude, setLatitude] = useState('37.7749');
  const [longitude, setLongitude] = useState('-122.4194');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState('Option A\nOption B');
  const [mediaGroupUrls, setMediaGroupUrls] = useState('https://example.com/1.jpg\nhttps://example.com/2.jpg');

  const [keyboardMode, setKeyboardMode] = useState<'none' | 'inline' | 'reply' | 'remove' | 'force_reply'>(
    initialReplyMarkup ? 'inline' : 'none'
  );
  const [inlineMarkupJson, setInlineMarkupJson] = useState(
    initialReplyMarkup || JSON.stringify({ inline_keyboard: [[{ text: 'Open Portal', url: 'https://t.me' }]] }, null, 2)
  );
  const [replyKeyboardRows, setReplyKeyboardRows] = useState('Check Status, Help\nSettings');

  const [disableNotification, setDisableNotification] = useState(false);
  const [protectContent, setProtectContent] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [expandedMsgId, setExpandedMsgId] = useState<number | null>(null);

  useEffect(() => {
    if (initialChatId) setChatId(initialChatId);
  }, [initialChatId]);

  useEffect(() => {
    if (initialReplyMarkup) {
      setKeyboardMode('inline');
      setInlineMarkupJson(initialReplyMarkup);
    }
  }, [initialReplyMarkup]);

  const loadBotData = async () => {
    if (!bot) return;
    const [chatsRes, msgsRes, tplRes] = await Promise.all([
      apiFetch<{ chats: BotChat[] }>(`/api/bots/${bot.id}/chats`),
      apiFetch<{ messages: BotMessage[] }>(`/api/bots/${bot.id}/messages`),
      apiFetch<{ templates: KeyboardTemplate[] }>(`/api/templates?botId=${bot.id}`),
    ]);
    setChats(chatsRes.chats);
    setMessages(msgsRes.messages);
    setTemplates(tplRes.templates);
    if (!chatId && chatsRes.chats.length > 0) {
      setChatId(chatsRes.chats[0].chat_id);
    }
  };

  useEffect(() => {
    loadBotData();
  }, [bot?.id]);

  const applyFormat = (tag: 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'pre' | 'link') => {
    const snippets: Record<string, Record<string, string>> = {
      HTML: {
        bold: '<b>bold</b>',
        italic: '<i>italic</i>',
        underline: '<u>underline</u>',
        strike: '<s>strike</s>',
        code: '<code>code</code>',
        pre: '<pre>console.log("xc")</pre>',
        link: '<a href="https://t.me">Link</a>',
      },
      MarkdownV2: {
        bold: '*bold*',
        italic: '_italic_',
        underline: '__underline__',
        strike: '~strike~',
        code: '`code`',
        pre: '```\ncode\n```',
        link: '[Link](https://t.me)',
      },
      None: {
        bold: 'bold',
        italic: 'italic',
        underline: 'underline',
        strike: 'strike',
        code: 'code',
        pre: 'code',
        link: 'https://t.me',
      },
    };
    const snippet = snippets[parseMode][tag];
    setText((prev) => (prev ? `${prev} ${snippet}` : snippet));
  };

  const buildReplyMarkup = (): unknown | undefined => {
    if (keyboardMode === 'none') return undefined;
    if (keyboardMode === 'remove') return { remove_keyboard: true };
    if (keyboardMode === 'force_reply') return { force_reply: true, selective: false };
    if (keyboardMode === 'reply') {
      const keyboard = replyKeyboardRows
        .split('\n')
        .map((line) =>
          line
            .split(',')
            .map((btn) => btn.trim())
            .filter(Boolean)
            .map((text) => ({ text }))
        )
        .filter((r) => r.length > 0);
      return { keyboard, resize_keyboard: true, one_time_keyboard: false };
    }
    if (keyboardMode === 'inline') {
      return JSON.parse(inlineMarkupJson);
    }
    return undefined;
  };

  const handleSendConfirmed = async () => {
    if (!bot) return;
    setSending(true);
    try {
      let replyMarkup: unknown;
      try {
        replyMarkup = buildReplyMarkup();
      } catch {
        onToast('error', 'Invalid Inline Keyboard JSON', 'Check your JSON syntax before sending.');
        setSending(false);
        return;
      }

      const body: Record<string, unknown> = {
        messageType,
        chatId,
        parseMode,
        text,
        mediaUrl,
        latitude: Number(latitude),
        longitude: Number(longitude),
        phoneNumber,
        firstName,
        lastName,
        pollQuestion,
        pollOptions: pollOptions.split('\n').map((s) => s.trim()).filter(Boolean),
        mediaGroup: mediaGroupUrls
          .split('\n')
          .map((u) => u.trim())
          .filter(Boolean)
          .map((u) => ({ type: 'photo', media: u })),
        disableNotification,
        protectContent,
        replyMarkup,
      };

      const res = await apiFetch<{ ok: boolean; durationMs: number }>(`/api/bots/${bot.id}/messages`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onToast('success', 'Message Dispatched', `Delivered to ${chatId} in ${res.durationMs}ms.`);
      setConfirmOpen(false);
      await loadBotData();
      onRefreshDashboard();
    } catch (err) {
      onToast('error', 'Send Failed', err instanceof Error ? err.message : 'Telegram API error');
    } finally {
      setSending(false);
    }
  };

  if (!bot) {
    return (
      <EmptyState
        icon={Send}
        title="No Connected Bot Selected"
        description="Connect a Telegram bot first to compose and dispatch messages."
      />
    );
  }

  let parsedPreviewButtons: Array<Array<{ text: string }>> = [];
  if (keyboardMode === 'inline') {
    try {
      const parsed = JSON.parse(inlineMarkupJson);
      if (Array.isArray(parsed?.inline_keyboard)) {
        parsedPreviewButtons = parsed.inline_keyboard;
      }
    } catch {
      parsedPreviewButtons = [];
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Composer */}
        <div className="xl:col-span-7 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="msg-bot" className="block text-xs font-medium mb-1">
                Active Bot
              </label>
              <select
                id="msg-bot"
                value={bot.id}
                onChange={(e) => onSelectBot(Number(e.target.value))}
                className="w-full px-3 py-2 min-h-[44px] text-xs font-medium rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              >
                {bots.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} (@{b.username})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="msg-type" className="block text-xs font-medium mb-1">
                Message Type
              </label>
              <select
                id="msg-type"
                value={messageType}
                onChange={(e) => setMessageType(e.target.value)}
                className="w-full px-3 py-2 min-h-[44px] text-xs font-medium rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              >
                {MESSAGE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="msg-known-chat" className="block text-xs font-medium mb-1">
                Known Chat Directory
              </label>
              <select
                id="msg-known-chat"
                value={chats.some((c) => c.chat_id === chatId) ? chatId : ''}
                onChange={(e) => {
                  if (e.target.value) setChatId(e.target.value);
                }}
                className="w-full px-3 py-2 min-h-[44px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              >
                <option value="">-- Select known chat or type ID --</option>
                {chats.map((c) => (
                  <option key={c.id} value={c.chat_id}>
                    {c.title || c.first_name || c.username || c.chat_id} ({c.chat_type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="msg-chat-id" className="block text-xs font-medium mb-1">
                Target Chat ID or @username
              </label>
              <input
                id="msg-chat-id"
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="104829104 or @channel"
                className="w-full px-3 py-2 min-h-[44px] text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              />
            </div>
          </div>

          {/* Conditional Fields by Message Type */}
          {['photo', 'video', 'document', 'audio', 'voice', 'animation'].includes(messageType) && (
            <div>
              <label className="block text-xs font-medium mb-1">Media URL or Telegram file_id</label>
              <input
                type="text"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://example.com/asset.png"
                className="w-full px-3 py-2 min-h-[44px] text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              />
            </div>
          )}

          {messageType === 'location' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Latitude</label>
                <input
                  type="text"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  className="w-full px-3 py-2 min-h-[44px] text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Longitude</label>
                <input
                  type="text"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  className="w-full px-3 py-2 min-h-[44px] text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                />
              </div>
            </div>
          )}

          {messageType === 'contact' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+14155550199"
                aria-label="Phone number"
                className="px-3 py-2 min-h-[44px] text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              />
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First Name"
                aria-label="First name"
                className="px-3 py-2 min-h-[44px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              />
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last Name"
                aria-label="Last name"
                className="px-3 py-2 min-h-[44px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              />
            </div>
          )}

          {messageType === 'poll' && (
            <div className="space-y-3">
              <input
                type="text"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Poll question..."
                aria-label="Poll question"
                className="w-full px-3 py-2 min-h-[44px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              />
              <textarea
                rows={3}
                value={pollOptions}
                onChange={(e) => setPollOptions(e.target.value)}
                placeholder="One option per line (2-10 options)"
                aria-label="Poll options"
                className="w-full p-3 text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              />
            </div>
          )}

          {messageType === 'media_group' && (
            <div>
              <label className="block text-xs font-medium mb-1">Media URLs (one per line, 2-10 photos)</label>
              <textarea
                rows={3}
                value={mediaGroupUrls}
                onChange={(e) => setMediaGroupUrls(e.target.value)}
                className="w-full p-3 text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              />
            </div>
          )}

          {/* Text / Caption & Formatting Toolbar */}
          {!['location', 'contact', 'poll', 'media_group'].includes(messageType) && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  {[
                    { id: 'bold' as const, icon: Bold, label: 'Bold' },
                    { id: 'italic' as const, icon: Italic, label: 'Italic' },
                    { id: 'underline' as const, icon: Underline, label: 'Underline' },
                    { id: 'strike' as const, icon: Strikethrough, label: 'Strikethrough' },
                    { id: 'code' as const, icon: Code, label: 'Inline Code' },
                    { id: 'pre' as const, icon: FileCode, label: 'Code Block' },
                    { id: 'link' as const, icon: LinkIcon, label: 'Insert Link' },
                  ].map((btn) => {
                    const Icon = btn.icon;
                    return (
                      <button
                        key={btn.id}
                        type="button"
                        onClick={() => applyFormat(btn.id)}
                        aria-label={btn.label}
                        title={btn.label}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[#E8EAF1] dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs"
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    );
                  })}
                </div>

                <select
                  aria-label="Parse Mode"
                  value={parseMode}
                  onChange={(e) => setParseMode(e.target.value as 'HTML' | 'MarkdownV2' | 'None')}
                  className="px-2.5 py-1.5 min-h-[36px] text-xs rounded-lg bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                >
                  <option value="HTML">HTML</option>
                  <option value="MarkdownV2">MarkdownV2</option>
                  <option value="None">Plain Text</option>
                </select>
              </div>

              <textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={messageType === 'text' ? 'Compose your Telegram message...' : 'Optional caption...'}
                aria-label="Message content"
                className="w-full p-3 text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
              />
            </div>
          )}

          {/* Keyboard Attachment */}
          <div className="space-y-2 pt-2 border-t border-[#E8EAF1] dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium">Keyboard Attachment</span>
              <div className="flex flex-wrap gap-1">
                {(['none', 'inline', 'reply', 'remove', 'force_reply'] as const).map((km) => (
                  <button
                    key={km}
                    type="button"
                    onClick={() => setKeyboardMode(km)}
                    className={`px-2.5 py-1 min-h-[32px] text-[11px] font-medium rounded-lg capitalize transition-colors ${
                      keyboardMode === km
                        ? 'bg-[#6555E8] dark:bg-[#7565F6] text-white'
                        : 'bg-[#F6F7FB] dark:bg-[#101421] text-[#73798C] dark:text-slate-400'
                    }`}
                  >
                    {km.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {keyboardMode === 'inline' && (
              <div className="space-y-2">
                {templates.length > 0 && (
                  <select
                    aria-label="Load saved keyboard template"
                    defaultValue=""
                    onChange={(e) => {
                      const found = templates.find((t) => String(t.id) === e.target.value);
                      if (found) setInlineMarkupJson(JSON.stringify(JSON.parse(found.payload_json), null, 2));
                    }}
                    className="w-full px-3 py-2 min-h-[40px] text-xs rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                  >
                    <option value="">Load saved keyboard template...</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
                <textarea
                  rows={4}
                  value={inlineMarkupJson}
                  onChange={(e) => setInlineMarkupJson(e.target.value)}
                  aria-label="Inline keyboard JSON"
                  className="w-full p-3 text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
                />
              </div>
            )}

            {keyboardMode === 'reply' && (
              <textarea
                rows={2}
                value={replyKeyboardRows}
                onChange={(e) => setReplyKeyboardRows(e.target.value)}
                placeholder="Comma-separated buttons per row"
                aria-label="Reply keyboard buttons"
                className="w-full p-3 text-xs font-mono rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800"
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-4 text-xs text-[#73798C] dark:text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={disableNotification}
                  onChange={(e) => setDisableNotification(e.target.checked)}
                />
                <span>Silent</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={protectContent}
                  onChange={(e) => setProtectContent(e.target.checked)}
                />
                <span>Protect Content</span>
              </label>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!chatId.trim()) {
                  onToast('error', 'Missing Chat ID', 'Enter or select a target Chat ID first.');
                  return;
                }
                setConfirmOpen(true);
              }}
              className="px-5 py-2.5 min-h-[44px] rounded-xl bg-[#6555E8] dark:bg-[#7565F6] hover:bg-[#5747d4] text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Send className="w-4 h-4" />
              <span>Preview & Send</span>
            </button>
          </div>
        </div>

        {/* Live Telegram Preview */}
        <div className="xl:col-span-5 bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold mb-4">
              <Eye className="w-4 h-4 text-[#22C8F6]" />
              <span>Telegram Client Preview</span>
            </div>

            <div className="rounded-2xl bg-[#0F172A] p-4 border border-slate-800 min-h-[260px] flex flex-col justify-end">
              <div className="max-w-[90%] space-y-1.5">
                <div className="rounded-2xl rounded-bl-sm bg-[#1E293B] text-slate-100 p-3.5 text-sm shadow-sm">
                  <div className="text-[11px] font-semibold text-[#22C8F6] mb-1">
                    {bot.name} (@{bot.username})
                  </div>
                  {mediaUrl && (
                    <div className="mb-2 px-2.5 py-2 rounded-lg bg-slate-900/80 text-[11px] font-mono text-slate-300 truncate">
                      [{messageType}] {mediaUrl}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                    {text || (messageType === 'poll' ? pollQuestion : `[${messageType} payload preview]`)}
                  </div>
                  <div className="text-[10px] text-slate-400 text-right mt-1.5 font-mono">
                    {parseMode} · {disableNotification ? 'silent' : 'notify'}
                  </div>
                </div>

                {keyboardMode === 'inline' && parsedPreviewButtons.length > 0 && (
                  <div className="space-y-1">
                    {parsedPreviewButtons.map((row, rIdx) => (
                      <div key={rIdx} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
                        {row.map((btn, bIdx) => (
                          <div
                            key={bIdx}
                            className="py-2 px-2 rounded-lg bg-[#1E293B]/90 border border-slate-700/60 text-center text-[11px] font-medium text-slate-100 truncate"
                          >
                            {btn.text}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 text-[11px] text-[#73798C] dark:text-slate-400">
            Target Chat: <span className="font-mono text-[#171A2B] dark:text-slate-200">{chatId || 'Not selected'}</span>
          </div>
        </div>
      </div>

      {/* Message History */}
      <section className="bg-white dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 rounded-2xl p-4 sm:p-5">
        <h3 className="text-sm font-semibold mb-3">Message History ({messages.length})</h3>
        {messages.length === 0 ? (
          <p className="text-xs text-[#73798C] dark:text-slate-400 py-4">No messages sent from @{bot.username} yet.</p>
        ) : (
          <div className="divide-y divide-[#E8EAF1] dark:divide-slate-800">
            {messages.map((m) => (
              <div key={m.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-semibold text-[#6555E8] dark:text-[#988DF9]">
                      #{m.telegram_message_id ?? '—'}
                    </span>
                    <span className="font-mono text-[#73798C] dark:text-slate-400">Chat {m.chat_id}</span>
                    <span>·</span>
                    <span className="capitalize">{m.message_type}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={m.delivery_status === 'sent' ? 'success' : 'danger'}
                      label={m.delivery_status}
                    />
                    <button
                      type="button"
                      onClick={() => setExpandedMsgId(expandedMsgId === m.id ? null : m.id)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      aria-label="Toggle API response"
                    >
                      {expandedMsgId === m.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-[#171A2B] dark:text-slate-300 mt-1 truncate">{m.content_preview}</p>
                {expandedMsgId === m.id && (
                  <div className="mt-2 p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[11px] font-mono text-[#73798C]">Telegram API Response · {m.sent_at}</span>
                      <CopyButton text={m.api_response_json} />
                    </div>
                    <pre className="text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all">
                      {m.api_response_json}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm Message Dispatch" maxWidth="max-w-md">
        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 space-y-1.5">
            <div>
              <span className="text-[#73798C]">Bot:</span> <span className="font-mono font-semibold">@{bot.username}</span>
            </div>
            <div>
              <span className="text-[#73798C]">Target Chat:</span> <span className="font-mono font-semibold">{chatId}</span>
            </div>
            <div>
              <span className="text-[#73798C]">Type:</span> <span className="capitalize font-semibold">{messageType}</span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="px-4 py-2.5 min-h-[44px] rounded-xl border border-[#E8EAF1] dark:border-slate-700 font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={handleSendConfirmed}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#20C997] hover:bg-[#18b184] text-[#090B14] font-bold inline-flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{sending ? 'Sending...' : 'Confirm & Send'}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
