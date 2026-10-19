-- 素材元数据。API / Worker 首次访问时执行，语句都可重复运行。
-- 没有生产口令；连接串由运行环境注入。

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  status TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  derivatives JSONB NOT NULL DEFAULT '{}'::jsonb,
  exif JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assets_status_check CHECK (
    status IN ('pending_upload', 'uploaded', 'processing', 'ready', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS assets_user_id_idx ON assets (user_id);

-- 清理任务按「仍在等待上传、且创建时间早于阈值」扫描。部分索引把已完成的行排除在外。
CREATE INDEX IF NOT EXISTS assets_pending_upload_created_idx
  ON assets (created_at)
  WHERE status = 'pending_upload';
