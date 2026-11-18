-- XC BOT CONTROL — Normalized Relational Schema (MySQL 8.0+ Reference)
CREATE DATABASE IF NOT EXISTS xc_bot_control CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE xc_bot_control;

-- 1. admin_users
CREATE TABLE admin_users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  recovery_hint VARCHAR(255) NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. bots
CREATE TABLE bots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bot_key VARCHAR(40) NOT NULL UNIQUE,
  telegram_bot_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(128) NOT NULL,
  username VARCHAR(64) NOT NULL,
  short_description TEXT NULL,
  description TEXT NULL,
  mode ENUM('live', 'sandbox') NOT NULL DEFAULT 'live',
  encrypted_token TEXT NOT NULL,
  token_fingerprint CHAR(64) NOT NULL UNIQUE,
  token_masked VARCHAR(64) NOT NULL,
  connection_status ENUM('connected', 'disconnected', 'invalid_token', 'webhook_error', 'api_error') NOT NULL DEFAULT 'connected',
  webhook_status ENUM('active', 'inactive', 'error') NOT NULL DEFAULT 'inactive',
  webhook_url VARCHAR(512) NULL,
  webhook_secret_encrypted TEXT NULL,
  can_join_groups TINYINT(1) NOT NULL DEFAULT 1,
  can_read_all_group_messages TINYINT(1) NOT NULL DEFAULT 0,
  supports_inline_queries TINYINT(1) NOT NULL DEFAULT 0,
  last_checked_at DATETIME NULL,
  last_activity_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bots_username (username),
  INDEX idx_bots_status (connection_status)
) ENGINE=InnoDB;

-- 3. bot_settings
CREATE TABLE bot_settings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bot_id BIGINT UNSIGNED NOT NULL UNIQUE,
  default_parse_mode ENUM('HTML', 'MarkdownV2', 'None') NOT NULL DEFAULT 'HTML',
  disable_notification TINYINT(1) NOT NULL DEFAULT 0,
  protect_content TINYINT(1) NOT NULL DEFAULT 0,
  auto_store_updates TINYINT(1) NOT NULL DEFAULT 1,
  allowed_updates JSON NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bot_settings_bot FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. bot_chats
CREATE TABLE bot_chats (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bot_id BIGINT UNSIGNED NOT NULL,
  chat_id VARCHAR(64) NOT NULL,
  chat_type ENUM('private', 'group', 'supergroup', 'channel') NOT NULL DEFAULT 'private',
  title VARCHAR(255) NULL,
  username VARCHAR(64) NULL,
  first_name VARCHAR(128) NULL,
  last_name VARCHAR(128) NULL,
  member_count INT NULL,
  last_interaction_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bot_chat (bot_id, chat_id),
  INDEX idx_bot_chats_type (bot_id, chat_type),
  CONSTRAINT fk_bot_chats_bot FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5. bot_updates
CREATE TABLE bot_updates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bot_id BIGINT UNSIGNED NOT NULL,
  update_id BIGINT NOT NULL,
  update_type VARCHAR(48) NOT NULL,
  chat_id VARCHAR(64) NULL,
  sender_username VARCHAR(64) NULL,
  summary TEXT NULL,
  processing_status ENUM('processed', 'duplicate', 'failed') NOT NULL DEFAULT 'processed',
  error_message TEXT NULL,
  raw_json JSON NOT NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bot_update_id (bot_id, update_id),
  INDEX idx_bot_updates_type_time (bot_id, update_type, received_at),
  CONSTRAINT fk_bot_updates_bot FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 6. bot_messages
CREATE TABLE bot_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bot_id BIGINT UNSIGNED NOT NULL,
  telegram_message_id BIGINT NULL,
  chat_id VARCHAR(64) NOT NULL,
  message_type VARCHAR(32) NOT NULL,
  parse_mode VARCHAR(24) NULL,
  content_preview TEXT NULL,
  reply_markup_json JSON NULL,
  delivery_status ENUM('sent', 'failed') NOT NULL,
  api_response_json JSON NOT NULL,
  error_message TEXT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bot_messages_bot_time (bot_id, sent_at),
  CONSTRAINT fk_bot_messages_bot FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 7. bot_commands
CREATE TABLE bot_commands (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bot_id BIGINT UNSIGNED NOT NULL,
  command VARCHAR(32) NOT NULL,
  description VARCHAR(256) NOT NULL,
  scope_type VARCHAR(32) NOT NULL DEFAULT 'default',
  language_code VARCHAR(8) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  synced_at DATETIME NULL,
  UNIQUE KEY uq_bot_command_scope (bot_id, command, scope_type, language_code),
  CONSTRAINT fk_bot_commands_bot FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 8. bot_templates
CREATE TABLE bot_templates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bot_id BIGINT UNSIGNED NULL,
  name VARCHAR(128) NOT NULL,
  template_type ENUM('inline_keyboard', 'reply_keyboard', 'message') NOT NULL DEFAULT 'inline_keyboard',
  payload_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bot_templates_bot FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 9. api_logs
CREATE TABLE api_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bot_id BIGINT UNSIGNED NULL,
  method VARCHAR(64) NOT NULL,
  http_status INT NOT NULL,
  telegram_error_code INT NULL,
  ok TINYINT(1) NOT NULL,
  duration_ms INT NOT NULL,
  request_payload_json JSON NULL,
  response_payload_json JSON NOT NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_api_logs_bot_time (bot_id, created_at),
  INDEX idx_api_logs_ok (ok),
  CONSTRAINT fk_api_logs_bot FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 10. webhook_logs
CREATE TABLE webhook_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bot_id BIGINT UNSIGNED NULL,
  update_id BIGINT NULL,
  http_status INT NOT NULL,
  secret_verified TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('accepted', 'duplicate', 'rejected', 'error') NOT NULL,
  error_message TEXT NULL,
  payload_preview TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_webhook_logs_bot_time (bot_id, created_at),
  CONSTRAINT fk_webhook_logs_bot FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 11. activity_logs
CREATE TABLE activity_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(64) NOT NULL,
  bot_id BIGINT UNSIGNED NULL,
  bot_name VARCHAR(128) NULL,
  status ENUM('success', 'warning', 'failed') NOT NULL DEFAULT 'success',
  related_resource VARCHAR(128) NULL,
  details TEXT NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activity_logs_time (created_at),
  INDEX idx_activity_logs_action (action)
) ENGINE=InnoDB;

-- 12. analytics_daily
CREATE TABLE analytics_daily (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  metric_date DATE NOT NULL,
  bot_id BIGINT UNSIGNED NOT NULL,
  messages_sent INT NOT NULL DEFAULT 0,
  updates_received INT NOT NULL DEFAULT 0,
  api_requests INT NOT NULL DEFAULT 0,
  api_success INT NOT NULL DEFAULT 0,
  api_failed INT NOT NULL DEFAULT 0,
  total_duration_ms BIGINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_analytics_day_bot (metric_date, bot_id),
  CONSTRAINT fk_analytics_bot FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 13. admin_sessions
CREATE TABLE admin_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_token_hash CHAR(64) NOT NULL UNIQUE,
  csrf_token VARCHAR(128) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  user_agent VARCHAR(255) NULL,
  ip_address VARCHAR(64) NULL,
  remember_me TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 14. saved_api_requests
CREATE TABLE saved_api_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bot_id BIGINT UNSIGNED NULL,
  name VARCHAR(128) NOT NULL,
  method VARCHAR(64) NOT NULL,
  params_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_saved_req_bot FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 15. notifications
CREATE TABLE notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bot_id BIGINT UNSIGNED NULL,
  severity ENUM('info', 'success', 'warning', 'error') NOT NULL DEFAULT 'info',
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_read (is_read, created_at)
) ENGINE=InnoDB;
