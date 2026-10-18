-- 相册、相册内素材、可撤销分享。
-- 分享只存 token_hash（小写 sha256 hex），不存明文令牌。
-- 语句可重复执行。依赖 users 与 assets；相册仓储会在同一把锁里先建那两张表。

CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  theme_id TEXT NOT NULL DEFAULT 'cotton-candy',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT albums_title_length_check CHECK (char_length(title) BETWEEN 1 AND 80),
  CONSTRAINT albums_theme_id_check CHECK (
    theme_id IN ('cotton-candy', 'kyoto-lantern', 'magazine-heirloom')
  )
);

CREATE INDEX IF NOT EXISTS albums_user_created_idx ON albums (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS album_assets (
  album_id TEXT NOT NULL REFERENCES albums (id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (album_id, asset_id)
);

CREATE INDEX IF NOT EXISTS album_assets_order_idx ON album_assets (album_id, position, created_at);

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  album_id TEXT NOT NULL REFERENCES albums (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shares_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT shares_token_hash_sha256_check CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS shares_album_id_idx ON shares (album_id);
