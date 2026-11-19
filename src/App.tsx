import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, setCsrfToken } from './lib/api';
import type { AdminUser, BotSummary, NavTab, NotificationItem, ThemeMode, ToastMessage } from './types';
import { AuthGate } from './components/auth/AuthGate';
import { AppShell } from './components/layout/AppShell';
import { DashboardView } from './components/views/DashboardView';
import { AddBotModal, BotsView } from './components/views/BotsView';
import { MessageCenterView } from './components/views/MessageCenterView';
import { ChatManagerView } from './components/views/ChatManagerView';
import { CommandManagerView } from './components/views/CommandManagerView';
import { KeyboardBuilderView } from './components/views/KeyboardBuilderView';
import { WebhookUpdatesView } from './components/views/WebhookUpdatesView';
import { ApiExplorerView } from './components/views/ApiExplorerView';
import { JsonInspectorView } from './components/views/JsonInspectorView';
import { DebugConsoleView } from './components/views/DebugConsoleView';
import { AnalyticsView, ActivityLogsView } from './components/views/AnalyticsActivityView';
import { SettingsHealthBackupView } from './components/views/SettingsHealthBackupView';
import { ToastContainer } from './components/ui/Primitives';
import { toSmallCaps } from './lib/smallCaps';

const SKIP_SMALL_CAPS_TAGS = new Set(['INPUT', 'TEXTAREA', 'CODE', 'PRE', 'SCRIPT', 'STYLE', 'NOSCRIPT']);

function useGlobalSmallCaps() {
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;

    const shouldSkipNode = (node: Node): boolean => {
      let el = node.parentElement;
      while (el) {
        if (SKIP_SMALL_CAPS_TAGS.has(el.tagName)) return true;
        if (el.isContentEditable || el.getAttribute('data-no-smallcaps') === 'true') return true;
        el = el.parentElement;
      }
      return false;
    };

    const applyToTree = (target: Node) => {
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      let current: Node | null = walker.nextNode();
      while (current) {
        if (!shouldSkipNode(current)) {
          const raw = current.nodeValue;
          if (raw && /[A-Za-z]/.test(raw)) {
            const converted = toSmallCaps(raw);
            if (converted !== raw) {
              current.nodeValue = converted;
            }
          }
        }
        current = walker.nextNode();
      }
    };

    applyToTree(root);

    let rafId = 0;
    const observer = new MutationObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        applyToTree(root);
        if (document.title && /[A-Za-z]/.test(document.title)) {
          const nextTitle = toSmallCaps(document.title);
          if (nextTitle !== document.title) {
            document.title = nextTitle;
          }
        }
      });
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);
}

export default function App() {
  useGlobalSmallCaps();
  const [booting, setBooting] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [admin, setAdmin] = useState<AdminUser | null>(null);

  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('xc_theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch {
      // ignore storage access issues
    }
    return 'dark';
  });

  const [appName, setAppName] = useState('XC BOT CONTROL');
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [activeBotId, setActiveBotId] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [addBotOpen, setAddBotOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Cross-module handoff states
  const [prefillChatId, setPrefillChatId] = useState<string | undefined>(undefined);
  const [prefillMarkup, setPrefillMarkup] = useState<string | undefined>(undefined);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((type: 'success' | 'error' | 'info', title: string, description?: string) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { id, type, title, description }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  // Apply Tailwind v4 `.dark` class cleanly
  useEffect(() => {
    const apply = () => {
      const isDark =
        theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDark);
    };
    apply();
    try {
      localStorage.setItem('xc_theme', theme);
    } catch {
      // ignore
    }
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);

  const cycleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const loadWorkspaceData = useCallback(async () => {
    try {
      const [botsRes, notifRes, settingsRes] = await Promise.all([
        apiFetch<{ bots: BotSummary[] }>('/api/bots'),
        apiFetch<{ notifications: NotificationItem[]; unread: number }>('/api/notifications'),
        apiFetch<{ app_name: string }>('/api/settings'),
      ]);
      setBots(botsRes.bots);
      setNotifications(notifRes.notifications);
      setUnreadCount(notifRes.unread);
      if (settingsRes.app_name) setAppName(settingsRes.app_name);
      setRefreshKey((k) => k + 1);
    } catch {
      // handled by auth gate if session expired
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const autostart = params.get('autostart') === '1';

        const status = await apiFetch<{
          setupRequired: boolean;
          authenticated: boolean;
          blocked?: boolean;
          csrfToken?: string;
          admin?: AdminUser;
        }>('/api/auth/status');

        if (status.authenticated && status.admin) {
          if (status.csrfToken) setCsrfToken(status.csrfToken);
          setAdmin(status.admin);
          setSetupRequired(false);
          setBlockedMessage(null);
        } else if (autostart) {
          const autoRes = await apiFetch<{ csrfToken: string; admin: AdminUser }>('/api/auth/autostart', {
            method: 'POST',
          });
          setCsrfToken(autoRes.csrfToken);
          setAdmin(autoRes.admin);
          setSetupRequired(false);
          setBlockedMessage(null);
        } else {
          setSetupRequired(status.setupRequired);
          setAdmin(null);
          if (status.blocked) {
            setBlockedMessage('Your account has been blocked by the administrator.');
          }
        }
      } finally {
        setBooting(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (admin) {
      loadWorkspaceData();
    }
  }, [admin, loadWorkspaceData]);

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setCsrfToken('');
      setAdmin(null);
      setSetupRequired(false);
      setBots([]);
      setActiveBotId(null);
    }
  };

  const handleMarkAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
  };

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F7FB] dark:bg-[#090B14] text-[#73798C] dark:text-slate-400 text-xs font-mono">
        Loading XC BOT CONTROL...
      </div>
    );
  }

  if (!admin) {
    return (
      <AuthGate
        setupRequired={setupRequired}
        blockedMessage={blockedMessage}
        theme={theme}
        onToggleTheme={cycleTheme}
        onAuthenticated={(user) => {
          setAdmin(user);
          setSetupRequired(false);
          setBlockedMessage(null);
        }}
      />
    );
  }

  return (
    <>
      <AppShell
        admin={admin}
        appName={appName}
        activeTab={activeTab}
        onNavigate={setActiveTab}
        bots={bots}
        activeBotId={activeBotId}
        onSelectBot={setActiveBotId}
        onOpenAddBot={() => setAddBotOpen(true)}
        theme={theme}
        onCycleTheme={cycleTheme}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkAllRead={handleMarkAllRead}
        onLogout={handleLogout}
      >
        {activeTab === 'dashboard' && (
          <DashboardView
            admin={admin}
            activeBotId={activeBotId}
            onSelectBot={setActiveBotId}
            onNavigate={setActiveTab}
            onOpenAddBot={() => setAddBotOpen(true)}
            refreshKey={refreshKey}
          />
        )}

        {activeTab === 'bots' && (
          <BotsView
            bots={bots}
            activeBotId={activeBotId}
            onSelectBot={setActiveBotId}
            onNavigate={setActiveTab}
            onOpenAddBot={() => setAddBotOpen(true)}
            onRefresh={loadWorkspaceData}
            onToast={pushToast}
          />
        )}

        {activeTab === 'messages' && (
          <MessageCenterView
            bots={bots}
            activeBotId={activeBotId}
            initialChatId={prefillChatId}
            initialReplyMarkup={prefillMarkup}
            onSelectBot={(id) => setActiveBotId(id)}
            onRefreshDashboard={loadWorkspaceData}
            onToast={pushToast}
          />
        )}

        {activeTab === 'chats' && (
          <ChatManagerView
            bots={bots}
            activeBotId={activeBotId}
            onSelectBot={(id) => setActiveBotId(id)}
            onSendMessageToChat={(botId, cId) => {
              setActiveBotId(botId);
              setPrefillChatId(cId);
              setActiveTab('messages');
            }}
            onToast={pushToast}
          />
        )}

        {activeTab === 'commands' && (
          <CommandManagerView
            bots={bots}
            activeBotId={activeBotId}
            onSelectBot={(id) => setActiveBotId(id)}
            onToast={pushToast}
          />
        )}

        {activeTab === 'keyboards' && (
          <KeyboardBuilderView
            bots={bots}
            activeBotId={activeBotId}
            onUseInMessageCenter={(markupJson) => {
              setPrefillMarkup(markupJson);
              setActiveTab('messages');
            }}
            onToast={pushToast}
          />
        )}

        {activeTab === 'webhooks' && (
          <WebhookUpdatesView
            bots={bots}
            activeBotId={activeBotId}
            onSelectBot={(id) => setActiveBotId(id)}
            onRefreshDashboard={loadWorkspaceData}
            onToast={pushToast}
          />
        )}

        {activeTab === 'explorer' && (
          <ApiExplorerView
            bots={bots}
            activeBotId={activeBotId}
            onSelectBot={(id) => setActiveBotId(id)}
            onRefreshDashboard={loadWorkspaceData}
            onToast={pushToast}
          />
        )}

        {activeTab === 'json' && <JsonInspectorView />}

        {activeTab === 'debug' && (
          <DebugConsoleView
            bots={bots}
            activeBotId={activeBotId}
            onSelectBot={setActiveBotId}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            bots={bots}
            activeBotId={activeBotId}
            onSelectBot={setActiveBotId}
          />
        )}

        {activeTab === 'activity' && <ActivityLogsView />}

        {activeTab === 'settings' && (
          <SettingsHealthBackupView
            admin={admin}
            onAdminUpdated={setAdmin}
            theme={theme}
            onSetTheme={setTheme}
            appName={appName}
            onAppNameChange={setAppName}
            onRefreshAll={loadWorkspaceData}
            onToast={pushToast}
          />
        )}
      </AppShell>

      <AddBotModal
        open={addBotOpen}
        onClose={() => setAddBotOpen(false)}
        onBotAdded={(bot) => {
          loadWorkspaceData();
          setActiveBotId(bot.id);
          setActiveTab('bots');
        }}
        onToast={pushToast}
      />

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </>
  );
}
