export type NavTab =
  | 'dashboard'
  | 'bots'
  | 'messages'
  | 'chats'
  | 'commands'
  | 'keyboards'
  | 'webhooks'
  | 'explorer'
  | 'json'
  | 'debug'
  | 'analytics'
  | 'activity'
  | 'settings';

export type ThemeMode = 'dark' | 'light' | 'system';

export type BadgeId = 'none' | 'verified_blue' | 'vip_gold' | 'dev_pro' | 'shield_ops' | 'creator';

export interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'user';
  avatarUrl?: string | null;
  badge?: BadgeId | string;
  createdIp?: string | null;
  lastLoginAt?: string | null;
}

export interface UserAccountSummary {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'user';
  avatarUrl: string | null;
  badge: BadgeId | string;
  isBlocked: boolean;
  createdIp: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminAuditEntry {
  id: number;
  admin_user_id: number;
  admin_username: string;
  admin_display_name: string;
  admin_avatar: string | null;
  action_type: 'ACCOUNT_DELETED' | 'USER_BLOCKED' | 'USER_UNBLOCKED' | 'ADMIN_PROMOTED' | 'ADMIN_DEMOTED' | 'NOTIFICATION_SENT' | string;
  affected_user_id: number | null;
  affected_username: string | null;
  affected_display_name: string | null;
  details: string;
  created_at: string;
}

export interface BotSummary {
  id: number;
  bot_key: string;
  telegram_bot_id: number;
  name: string;
  username: string;
  short_description: string;
  description: string;
  mode: 'live' | 'sandbox';
  token_masked: string;
  connection_status: 'connected' | 'disconnected' | 'invalid_token' | 'webhook_error' | 'api_error';
  webhook_status: 'active' | 'inactive' | 'error';
  webhook_url: string | null;
  avatar_url?: string | null;
  has_webhook_secret: boolean;
  pending_update_count: number;
  last_webhook_error: string | null;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
  supports_inline_queries: boolean;
  last_checked_at: string | null;
  last_activity_at: string | null;
  counts?: {
    chats: number;
    messages: number;
    updates: number;
  };
  settings?: {
    default_parse_mode: 'HTML' | 'MarkdownV2' | 'None';
    disable_notification: number;
    protect_content: number;
    auto_store_updates: number;
  };
}

export interface BotChat {
  id: number;
  bot_id: number;
  chat_id: string;
  chat_type: 'private' | 'group' | 'supergroup' | 'channel';
  title: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  member_count: number | null;
  last_interaction_at: string;
}

export interface BotMessage {
  id: number;
  bot_id: number;
  telegram_message_id: number | null;
  chat_id: string;
  message_type: string;
  parse_mode: string | null;
  content_preview: string | null;
  reply_markup_json: string | null;
  delivery_status: 'sent' | 'failed';
  api_response_json: string;
  error_message: string | null;
  sent_at: string;
}

export interface BotUpdate {
  id: number;
  bot_id: number;
  bot_name: string;
  bot_username: string;
  update_id: number;
  update_type: string;
  chat_id: string | null;
  sender_username: string | null;
  summary: string | null;
  processing_status: 'processed' | 'duplicate' | 'failed';
  error_message: string | null;
  raw_json: string;
  received_at: string;
}

export interface BotCommand {
  id?: number;
  command: string;
  description: string;
  scope_type?: string;
  language_code?: string;
}

export interface KeyboardTemplate {
  id: number;
  bot_id: number | null;
  name: string;
  template_type: string;
  payload_json: string;
  created_at: string;
}

export interface NotificationItem {
  id: number;
  bot_id: number | null;
  target_user_id?: number | null;
  recipient_role?: string;
  kind?: 'system' | 'admin_broadcast' | 'signup_alert' | 'profile_change' | string;
  severity: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  sender_name?: string | null;
  sender_avatar?: string | null;
  sender_badge?: string | null;
  sender_ip?: string | null;
  is_read: number;
  created_at: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}
