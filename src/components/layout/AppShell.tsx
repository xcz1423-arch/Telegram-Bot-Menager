import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Bot,
  Send,
  Users,
  TerminalSquare,
  Grid2x2,
  Webhook,
  Code2,
  Braces,
  Bug,
  BarChart3,
  History,
  Settings,
  Menu,
  X,
  Search,
  Bell,
  Sun,
  Moon,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  UserCircle2,
  Globe,
  Megaphone,
  UserPlus,
  ShieldAlert,
} from 'lucide-react';
import type { AdminUser, BotSummary, NavTab, NotificationItem, ThemeMode } from '../../types';
import { Modal } from '../ui/Primitives';
import { UserAvatar, VerifiedBadgeIcon } from '../ui/VerifiedBadge';
import { ThemeBackdrop } from './ThemeBackdrop';

interface NavGroup {
  label: string;
  items: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Core',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'bots', label: 'Bot Fleet', icon: Bot },
    ],
  },
  {
    label: 'Bot Operations',
    items: [
      { id: 'messages', label: 'Message Center', icon: Send },
      { id: 'chats', label: 'Chat Manager', icon: Users },
      { id: 'commands', label: 'Commands', icon: TerminalSquare },
      { id: 'keyboards', label: 'Keyboard Builder', icon: Grid2x2 },
      { id: 'webhooks', label: 'Webhooks & Updates', icon: Webhook },
    ],
  },
  {
    label: 'Developer Console',
    items: [
      { id: 'explorer', label: 'API Explorer', icon: Code2 },
      { id: 'json', label: 'JSON Inspector', icon: Braces },
      { id: 'debug', label: 'Debug Console', icon: Bug },
    ],
  },
  {
    label: 'Observability & System',
    items: [
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      { id: 'activity', label: 'Activity Logs', icon: History },
      { id: 'settings', label: 'Settings & Backup', icon: Settings },
    ],
  },
];

const TAB_TITLES: Record<NavTab, string> = {
  dashboard: 'Overview Dashboard',
  bots: 'Bot Fleet & Workspaces',
  messages: 'Message Center',
  chats: 'Chat Manager',
  commands: 'Command Manager',
  keyboards: 'Inline Keyboard Builder',
  webhooks: 'Webhooks & Update Monitor',
  explorer: 'Telegram API Explorer',
  json: 'JSON Inspector',
  debug: 'Debug Console',
  analytics: 'Analytics Center',
  activity: 'Audit Activity Logs',
  settings: 'Settings, Health & Backup',
};

const TAB_SHORT_TITLES: Record<NavTab, string> = {
  dashboard: 'Overview',
  bots: 'Bot Fleet',
  messages: 'Messages',
  chats: 'Chats',
  commands: 'Commands',
  keyboards: 'Keyboards',
  webhooks: 'Webhooks',
  explorer: 'API Explorer',
  json: 'JSON',
  debug: 'Debug',
  analytics: 'Analytics',
  activity: 'Audit Logs',
  settings: 'Settings',
};

export function AppShell({
  admin,
  appName,
  activeTab,
  onNavigate,
  bots,
  activeBotId,
  onSelectBot,
  onOpenAddBot,
  theme,
  onCycleTheme,
  notifications,
  unreadCount,
  onMarkAllRead,
  onLogout,
  children,
}: {
  admin: AdminUser;
  appName: string;
  activeTab: NavTab;
  onNavigate: (tab: NavTab) => void;
  bots: BotSummary[];
  activeBotId: number | null;
  onSelectBot: (botId: number | null) => void;
  onOpenAddBot: () => void;
  theme: ThemeMode;
  onCycleTheme: () => void;
  notifications: NotificationItem[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const activeBot = bots.find((b) => b.id === activeBotId) || null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const allItems = NAV_GROUPS.flatMap((g) => g.items);
  const searchResults = searchQuery.trim()
    ? {
        pages: allItems.filter((i) => i.label.toLowerCase().includes(searchQuery.toLowerCase())),
        bots: bots.filter(
          (b) =>
            b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            b.username.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      }
    : { pages: allItems.slice(0, 6), bots };

  const handleNavClick = (tab: NavTab) => {
    onNavigate(tab);
    setMobileDrawerOpen(false);
    setSearchOpen(false);
  };

  return (
    <div className="xc-themed-workspace relative min-h-screen flex bg-[#F4F6FD] dark:bg-[#070815] text-[#171A2B] dark:text-slate-100 overflow-x-hidden">
      <ThemeBackdrop variant="workspace" />
      {/* Desktop Collapsible Sidebar */}
      <aside
        aria-label="Primary navigation"
        className={`relative z-20 hidden lg:flex flex-col shrink-0 border-r border-[#E2E6F5]/85 dark:border-[#7C6BFF]/20 bg-white/80 dark:bg-[#0C0F20]/76 backdrop-blur-md transition-all duration-200 sticky top-0 h-screen ${
          sidebarCollapsed ? 'w-[74px]' : 'w-[256px]'
        }`}
      >
        <div className="h-[84px] px-3.5 flex items-center justify-between border-b border-[#E2E6F5]/85 dark:border-[#7C6BFF]/20 shrink-0">
          <button
            type="button"
            onClick={() => handleNavClick('dashboard')}
            className="flex items-center gap-2 min-w-0 text-left"
          >
            <img
              src="/assets/aistudio/file_000000007dd8820b9043e2e9eb3cd7c6_34c37a13.png"
              alt={appName}
              className={
                sidebarCollapsed
                  ? 'w-11 h-8 object-contain shrink-0 border-0'
                  : 'w-[84px] h-[64px] object-contain shrink-0 border-0'
              }
            />
            {!sidebarCollapsed && (
              <span className="font-display font-bold text-[13px] tracking-tight truncate">{appName}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-lg text-[#73798C] hover:text-[#171A2B] dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!sidebarCollapsed && (
                <div className="px-2.5 mb-1.5 text-[11px] font-medium text-[#73798C] dark:text-slate-500">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavClick(item.id)}
                      title={sidebarCollapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 min-h-[40px] rounded-xl text-xs font-medium transition-colors ${
                        active
                          ? 'bg-[#6555E8]/10 dark:bg-[#7565F6]/15 text-[#6555E8] dark:text-[#A599FF]'
                          : 'text-[#73798C] dark:text-slate-400 hover:text-[#171A2B] dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {!sidebarCollapsed && (
          <div className="p-3 border-t border-[#E8EAF1] dark:border-slate-800/90">
            <button
              type="button"
              onClick={onOpenAddBot}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#6555E8] dark:bg-[#7565F6] hover:bg-[#5646d5] text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Connect Bot</span>
            </button>
          </div>
        )}
      </aside>

      {/* Mobile Slide-Over Navigation Drawer */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setMobileDrawerOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] h-full bg-white/88 dark:bg-[#0C0F20]/88 backdrop-blur-md border-r border-[#E2E6F5]/85 dark:border-[#7C6BFF]/25 flex flex-col z-10">
            <div className="h-[84px] px-4 flex items-center justify-between border-b border-[#E8EAF1] dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <img
                  src="/assets/aistudio/file_000000007dd8820b9043e2e9eb3cd7c6_34c37a13.png"
                  alt={appName}
                  className="w-24 h-[68px] object-contain shrink-0 border-0"
                />
                <span className="font-display font-bold text-sm">{appName}</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Close navigation menu"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#73798C] dark:text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="px-2.5 mb-1.5 text-[11px] font-medium text-[#73798C] dark:text-slate-500">
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleNavClick(item.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-colors ${
                            active
                              ? 'bg-[#6555E8]/12 dark:bg-[#7565F6]/15 text-[#6555E8] dark:text-[#A599FF]'
                              : 'text-[#171A2B] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-[#E8EAF1] dark:border-slate-800 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  onNavigate('settings');
                }}
                className="w-full p-2.5 rounded-xl bg-[#F6F7FB] dark:bg-[#151B2B] border border-[#E8EAF1] dark:border-slate-800 flex items-center gap-2.5 text-left"
              >
                <UserAvatar
                  avatarUrl={admin.avatarUrl}
                  displayName={admin.displayName}
                  username={admin.username}
                  badge={admin.badge}
                  role={admin.role}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate flex items-center gap-1">
                    <span data-no-smallcaps="true" className="truncate">{admin.displayName}</span>
                    <VerifiedBadgeIcon badge={admin.badge} role={admin.role} size="xs" />
                  </div>
                  <div className="text-[10px] font-mono text-[#73798C] dark:text-slate-400 truncate">
                    <span data-no-smallcaps="true">@{admin.username}</span> · {admin.role}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  setSearchOpen(true);
                }}
                className="w-full min-h-[44px] px-4 rounded-xl border border-[#E8EAF1] dark:border-slate-800 text-xs font-medium flex items-center justify-center gap-2"
              >
                <Search className="w-4 h-4" />
                <span>Quick Search</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  onOpenAddBot();
                }}
                className="w-full min-h-[44px] px-4 rounded-xl bg-[#6555E8] dark:bg-[#7565F6] text-white text-sm font-medium flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Connect New Bot</span>
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="w-full min-h-[44px] px-4 rounded-xl border border-[#E8EAF1] dark:border-slate-800 text-xs font-medium text-[#F05B75] flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-30 h-[52px] lg:h-14 px-3 sm:px-6 bg-white/76 dark:bg-[#0C0F20]/74 backdrop-blur-md border-b border-[#E2E6F5]/85 dark:border-[#7C6BFF]/20 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open navigation drawer"
              className="lg:hidden min-h-[44px] min-w-[44px] -ml-1.5 flex items-center justify-center rounded-xl text-[#171A2B] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-display font-semibold truncate sm:hidden">
                {TAB_SHORT_TITLES[activeTab]}
              </h1>
              <h1 className="text-sm sm:text-base font-display font-semibold truncate hidden sm:block">
                {TAB_TITLES[activeTab]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Active Bot Selector */}
            <div className="relative">
              <label htmlFor="global-bot-selector" className="sr-only">
                Active Bot Selector
              </label>
              <select
                id="global-bot-selector"
                value={activeBotId ?? ''}
                onChange={(e) => onSelectBot(e.target.value ? Number(e.target.value) : null)}
                className="h-9 max-w-[118px] sm:max-w-[210px] pl-2.5 pr-6 sm:pr-7 text-xs font-medium rounded-xl bg-white/75 dark:bg-[#141930]/75 border border-[#E2E6F5] dark:border-[#7C6BFF]/25 text-[#171A2B] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#7565F6] appearance-none truncate"
              >
                <option value="">All Bots ({bots.length})</option>
                {bots.map((b) => (
                  <option key={b.id} value={b.id} data-no-smallcaps="true">
                    @{b.username}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#73798C] pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
            </div>

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Global search"
              className="hidden sm:flex min-h-[40px] min-w-[40px] sm:px-3 items-center justify-center gap-1.5 rounded-xl border border-[#E2E6F5] dark:border-[#7C6BFF]/25 bg-white/75 dark:bg-[#141930]/75 text-xs text-[#73798C] dark:text-slate-400 hover:text-[#171A2B] dark:hover:text-white transition-colors"
            >
              <Search className="w-4 h-4" />
              <span className="hidden md:inline whitespace-nowrap">Search</span>
            </button>

            <button
              type="button"
              onClick={onCycleTheme}
              aria-label={`Switch theme (current: ${theme})`}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[#E2E6F5] dark:border-[#7C6BFF]/25 bg-white/75 dark:bg-[#141930]/75 text-[#73798C] dark:text-slate-300 hover:text-[#171A2B] dark:hover:text-white transition-colors"
            >
              {(theme === 'dark' ||
                (theme === 'system' &&
                  typeof window !== 'undefined' &&
                  window.matchMedia('(prefers-color-scheme: dark)').matches)) ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen(!notifOpen);
                  setProfileOpen(false);
                }}
                aria-label="Notifications"
                className="relative min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[#E2E6F5] dark:border-[#7C6BFF]/25 bg-white/75 dark:bg-[#141930]/75 text-[#73798C] dark:text-slate-300 hover:text-[#171A2B] dark:hover:text-white transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#F05B75] text-white text-[10px] font-mono font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[calc(100vw-24px)] rounded-2xl bg-white/92 dark:bg-[#0D1023]/92 backdrop-blur-md border border-[#E2E6F5] dark:border-[#7C6BFF]/25 shadow-xl p-3 z-50">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E8EAF1] dark:border-slate-800">
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-[#7565F6]" />
                      <span>Messages & Notifications</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onMarkAllRead();
                        setNotifOpen(false);
                      }}
                      className="text-[11px] text-[#6555E8] dark:text-[#988DF9] hover:underline"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto space-y-2">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-[#73798C] dark:text-slate-400 py-5 text-center">No messages or notifications yet.</p>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`p-2.5 rounded-xl text-xs border transition-colors ${
                            n.kind === 'login_alert' && !n.is_read
                              ? 'border-[#F5B942]/45 bg-[#F5B942]/8'
                              : n.is_read
                              ? 'border-transparent bg-slate-50/60 dark:bg-[#101421]/60'
                              : 'border-[#7565F6]/30 bg-[#7565F6]/5'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            {n.kind === 'login_alert' ? (
                              <div className="w-8 h-8 rounded-full bg-[#F5B942]/15 text-[#D99B16] dark:text-[#F5B942] flex items-center justify-center shrink-0 mt-0.5 border border-[#F5B942]/30">
                                <ShieldAlert className="w-4 h-4" />
                              </div>
                            ) : n.sender_avatar ? (
                              <img
                                src={n.sender_avatar}
                                alt={n.sender_name || 'User'}
                                className="w-8 h-8 rounded-full object-cover border border-[#E8EAF1] dark:border-slate-700 shrink-0 mt-0.5"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-[#7565F6]/12 text-[#7565F6] flex items-center justify-center shrink-0 mt-0.5">
                                {n.kind === 'signup_alert' ? (
                                  <UserPlus className="w-3.5 h-3.5" />
                                ) : n.kind === 'admin_broadcast' ? (
                                  <Megaphone className="w-3.5 h-3.5" />
                                ) : (
                                  <Bell className="w-3.5 h-3.5" />
                                )}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="font-semibold text-[#171A2B] dark:text-slate-100 truncate">{n.title}</span>
                                {n.kind === 'login_alert' ? (
                                  <span className="px-1.5 py-0.5 rounded-full bg-[#F5B942]/15 text-[#D99B16] dark:text-[#F5B942] text-[9px] font-semibold shrink-0">
                                    Alert
                                  </span>
                                ) : (
                                  <VerifiedBadgeIcon badge={n.sender_badge} size="xs" />
                                )}
                              </div>
                              <p className="text-[#73798C] dark:text-slate-300 mt-0.5 leading-relaxed break-words">{n.message}</p>
                              <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] font-mono text-[#73798C] dark:text-slate-500">
                                {n.sender_name && <span>By <span data-no-smallcaps="true">{n.sender_name}</span></span>}
                                {n.sender_ip && (
                                  <span className="inline-flex items-center gap-0.5 text-[#22C8F6]" data-no-smallcaps="true">
                                    <Globe className="w-2.5 h-2.5" />
                                    {n.sender_ip}
                                  </span>
                                )}
                                <span>{n.created_at}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Menu */}
            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(!profileOpen);
                  setNotifOpen(false);
                }}
                aria-label="User profile menu"
                className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 min-h-[40px] rounded-xl border border-[#E2E6F5] dark:border-[#7C6BFF]/25 bg-white/75 dark:bg-[#141930]/75 hover:border-slate-300 dark:hover:border-[#7C6BFF]/45 transition-colors"
              >
                <UserAvatar
                  avatarUrl={admin.avatarUrl}
                  displayName={admin.displayName}
                  username={admin.username}
                  badge={admin.badge}
                  role={admin.role}
                  size="sm"
                />
                <span data-no-smallcaps="true" className="text-xs font-medium max-w-[110px] truncate">{admin.displayName}</span>
                <VerifiedBadgeIcon badge={admin.badge} role={admin.role} size="xs" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-60 rounded-2xl bg-white/92 dark:bg-[#0D1023]/92 backdrop-blur-md border border-[#E2E6F5] dark:border-[#7C6BFF]/25 shadow-xl p-2 z-50">
                  <div className="px-3 py-2 border-b border-[#E8EAF1] dark:border-slate-800 mb-1 flex items-center gap-2.5">
                    <UserAvatar
                      avatarUrl={admin.avatarUrl}
                      displayName={admin.displayName}
                      username={admin.username}
                      badge={admin.badge}
                      role={admin.role}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate flex items-center gap-1">
                        <span data-no-smallcaps="true" className="truncate">{admin.displayName}</span>
                        <VerifiedBadgeIcon badge={admin.badge} role={admin.role} size="xs" />
                      </div>
                      <div className="text-[11px] font-mono text-[#73798C] dark:text-slate-400 truncate">
                        <span data-no-smallcaps="true">@{admin.username}</span> · {admin.role === 'admin' ? 'Admin' : 'User'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onNavigate('settings');
                    }}
                    className="w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                  >
                    <UserCircle2 className="w-3.5 h-3.5" />
                    <span>My Profile & Settings</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onLogout();
                    }}
                    className="w-full text-left px-3 py-2 text-xs rounded-xl text-[#F05B75] hover:bg-[#F05B75]/10 flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Active Bot Context Bar (when a specific bot is selected) */}
        {activeBot && (
          <div className="px-3 sm:px-6 py-2 bg-[#6555E8]/10 dark:bg-[#7565F6]/14 backdrop-blur-md border-b border-[#E2E6F5]/85 dark:border-[#7C6BFF]/20 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span data-no-smallcaps="true" className="font-semibold text-[#171A2B] dark:text-slate-100 truncate">{activeBot.name}</span>
              <span aria-hidden="true" className="text-[#73798C]">·</span>
              <span data-no-smallcaps="true" className="font-mono text-[#6555E8] dark:text-[#A599FF]">@{activeBot.username}</span>
              <span aria-hidden="true" className="text-[#73798C] hidden sm:inline">·</span>
              <span className="font-mono text-[#73798C] dark:text-slate-400 hidden sm:inline">
                ID {activeBot.telegram_bot_id}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSelectBot(null)}
              className="text-xs font-medium text-[#6555E8] dark:text-[#A599FF] hover:underline whitespace-nowrap"
            >
              Show All Bots
            </button>
          </div>
        )}

        {/* Scrollable Workspace Content */}
        <main className="flex-1 p-3 sm:p-6 pb-24 lg:pb-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Fixed Thumb-Zone Bottom Navigation Bar (58px + safe area) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white/86 dark:bg-[#0C0F20]/84 backdrop-blur-md border-t border-[#E2E6F5]/85 dark:border-[#7C6BFF]/20 grid grid-cols-5 h-[58px] pb-safe"
      >
        {[
          { id: 'dashboard' as NavTab, label: 'Overview', icon: LayoutDashboard },
          { id: 'messages' as NavTab, label: 'Message', icon: Send },
          { id: 'explorer' as NavTab, label: 'API', icon: Code2 },
          { id: 'webhooks' as NavTab, label: 'Updates', icon: Webhook },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`flex flex-col items-center justify-center min-h-[44px] ${
                active ? 'text-[#6555E8] dark:text-[#988DF9]' : 'text-[#73798C] dark:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium mt-0.5">{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className="flex flex-col items-center justify-center min-h-[44px] text-[#73798C] dark:text-slate-400"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-0.5">More</span>
        </button>
      </nav>

      {/* Global Search Modal */}
      <Modal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Quick Jump & Global Search"
        subtitle="Jump to any console module or connected Telegram bot"
      >
        <div className="space-y-4">
          <input
            type="search"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search pages or bots (@username)..."
            className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-xl bg-[#F6F7FB] dark:bg-[#101421] border border-[#E8EAF1] dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7565F6]"
          />

          <div>
            <div className="text-xs font-medium text-[#73798C] dark:text-slate-400 mb-2">Modules</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {searchResults.pages.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className="flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-[#6555E8] dark:text-[#988DF9]" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {searchResults.bots.length > 0 && (
            <div>
              <div className="text-xs font-medium text-[#73798C] dark:text-slate-400 mb-2">Connected Bots</div>
              <div className="space-y-1.5">
                {searchResults.bots.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      onSelectBot(b.id);
                      handleNavClick('bots');
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-xl text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <span data-no-smallcaps="true" className="font-medium">{b.name}</span>
                    <span data-no-smallcaps="true" className="font-mono text-[#73798C] dark:text-slate-400">@{b.username}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
