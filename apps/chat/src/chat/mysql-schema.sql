-- Chat 消息持久化表结构（参考用）
-- 实际建表由 apps/chat/src/store.js 的 store.init() 在启动时自动执行
-- CREATE TABLE IF NOT EXISTS，无需手动执行；本文件仅作运维/审计参考。
--
-- 启用方式：在运行 chat 服务的环境中配置 MYSQL_* 环境变量（复用服务器 MySQL）：
--   MYSQL_HOST / MYSQL_PORT / MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD
-- 不配置则回退纯内存模式（重启即清空）。

CREATE TABLE IF NOT EXISTS chat_messages (
  id VARCHAR(64) NOT NULL,                                  -- 消息 UUID（主键，幂等去重）
  channel VARCHAR(191) NOT NULL,                            -- group:xxx / dm:a:b / group:public
  author_id VARCHAR(191),                                   -- 发送者 userId（登录 id 或 guest_xxx）
  author_name VARCHAR(191),                                 -- 发送者昵称
  author_is_guest TINYINT(1) NOT NULL DEFAULT 0,            -- 是否游客
  author_json JSON,                                         -- 完整 identity（含头像 image 等），回放时还原
  text TEXT,                                                -- 消息正文
  ts BIGINT NOT NULL,                                       -- 发送时间戳（ms）
  client_msg_id VARCHAR(64),                                -- 客户端幂等 id（同频道+同值去重）
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_channel_client (channel, client_msg_id),    -- 同一频道内客户端去重；NULL 允许多个
  KEY idx_channel_ts (channel, ts)                          -- 历史按频道+时间拉取
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
