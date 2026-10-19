import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { originalObjectKey } from "@memora/shared";
import {
  EmailTakenError,
  MAX_ALBUMS_PER_USER,
  MAX_ASSETS_PER_ALBUM,
  type AddAssetsResult,
  type AlbumRepository,
  type AlbumSummary,
  type AssetRecord,
  type AssetRepository,
  type AuthRepository,
  type AuthUser,
  type CreateAlbumResult,
  type CreateShareResult,
  type HeadResult,
  type NewAlbum,
  type NewAsset,
  type NewAuthSession,
  type NewAuthUser,
  type NewShare,
  type ObjectStore,
  type PendingAlbumTarget,
  type PresignPutInput,
  type PublicShareView,
  type ReservePendingResult,
  type ShareReadAccess,
  type ShareRecord,
  type AssetJobEnqueuer,
} from "@memora/storage";
import type { Express } from "express";
import { createConfig } from "./config.js";
import { createApp } from "./server.js";

export const TEST_PASSWORD = "correct-horse";

export const ENV = {
  DEPLOY_MODE: "selfhost",
  MEMORA_ENV: "local",
  STORAGE_BACKEND: "minio",
  S3_BUCKET: "memora-local",
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_ACCESS_KEY_ID: "memora",
  S3_SECRET_ACCESS_KEY: "test-secret-value",
  PRESIGN_TTL_MINUTES: "10",
  MAX_UPLOAD_BYTES: "1024",
  DATABASE_URL: "postgresql://memora:test@127.0.0.1:5432/memora",
  REDIS_URL: "redis://127.0.0.1:6379",
} satisfies NodeJS.ProcessEnv;

export function record(
  partial: Partial<AssetRecord> & Pick<AssetRecord, "id" | "status">,
): AssetRecord {
  const userId = partial.userId ?? "local";
  return {
    filename: "trip.jpg",
    contentType: "image/jpeg",
    sizeBytes: 100,
    width: null,
    height: null,
    derivatives: {},
    exif: null,
    error: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
    userId,
    storageKey: partial.storageKey ?? originalObjectKey(userId, partial.id),
  };
}

function pendingRecord(asset: NewAsset): AssetRecord {
  return record({
    id: asset.id,
    userId: asset.userId,
    storageKey: asset.storageKey,
    filename: asset.filename,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
    status: "pending_upload",
  });
}

export interface MemoryAlbumLink {
  getOwnedAlbum: AlbumRepository["getOwnedAlbum"];
  addAssets: AlbumRepository["addAssets"];
  detachAsset: (assetId: string) => void;
}

export function memoryAssets(
  seed: AssetRecord[] = [],
): AssetRepository & {
  rows: Map<string, AssetRecord>;
  useAlbums: (albums: MemoryAlbumLink) => void;
} {
  const rows = new Map(seed.map((row) => [row.id, row]));
  let albums: MemoryAlbumLink | null = null;
  return {
    rows,
    useAlbums(next) {
      albums = next;
    },
    async ready() {},
    async insertPending(asset: NewAsset) {
      rows.set(asset.id, pendingRecord(asset));
    },
    async reservePendingUpload(
      asset: NewAsset,
      maxPending: number,
      target?: PendingAlbumTarget | null,
    ): Promise<ReservePendingResult> {
      if (!Number.isInteger(maxPending) || maxPending < 1) return "limit";
      if (target) {
        if (!albums) return "album_not_found";
        const album = await albums.getOwnedAlbum(target.albumId, asset.userId);
        if (!album) return "album_not_found";
        if (album.assetCount >= target.maxAssets) return "album_full";
      }
      let pending = 0;
      for (const row of rows.values()) {
        if (row.userId === asset.userId && row.status === "pending_upload") pending += 1;
      }
      if (pending >= maxPending) return "limit";
      rows.set(asset.id, pendingRecord(asset));
      if (target && albums) {
        const added = await albums.addAssets(target.albumId, asset.userId, [asset.id]);
        if (!added.ok) {
          rows.delete(asset.id);
          return added.reason === "too_many" ? "album_full" : "album_not_found";
        }
      }
      return "ok";
    },
    async deletePending(id) {
      const current = rows.get(id);
      if (current?.status === "pending_upload") {
        rows.delete(id);
        albums?.detachAsset(id);
      }
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
    async markUploaded(id) {
      const current = rows.get(id);
      if (!current) return null;
      if (current.status === "pending_upload") current.status = "uploaded";
      return current;
    },
    async markProcessing() {},
    async markReady() {},
    async markFailed() {},
    async saveExif() {},
    async noteExifFailure() {},
    async listByUser(userId, limit) {
      const size = Math.min(500, Math.max(1, Math.trunc(limit)));
      return [...rows.values()]
        .filter((row) => row.userId === userId)
        .sort((a, b) => {
          if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
          return a.id < b.id ? 1 : -1;
        })
        .slice(0, size);
    },
    async close() {},
  };
}

export function memoryAuth(): AuthRepository & { users: Map<string, AuthUser> } {
  const users = new Map<string, AuthUser>();
  const sessions = new Map<
    string,
    { userId: string; expiresAt: Date; revokedAt: Date | null }
  >();
  return {
    users,
    async ready() {},
    async insertUser(user: NewAuthUser) {
      for (const existing of users.values()) {
        if (existing.email === user.email) throw new EmailTakenError();
      }
      const stored: AuthUser = {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        createdAt: "2026-01-01T00:00:00.000Z",
      };
      users.set(stored.id, stored);
      return stored;
    },
    async findUserByEmail(email) {
      for (const user of users.values()) {
        if (user.email === email) return user;
      }
      return null;
    },
    async insertSession(session: NewAuthSession) {
      sessions.set(session.tokenHash, {
        userId: session.userId,
        expiresAt: session.expiresAt,
        revokedAt: null,
      });
    },
    async findActiveSession(tokenHash) {
      const row = sessions.get(tokenHash);
      if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;
      const user = users.get(row.userId);
      if (!user) return null;
      return {
        userId: user.id,
        email: user.email,
        expiresAt: row.expiresAt.toISOString(),
      };
    },
    async revokeSession(tokenHash) {
      const row = sessions.get(tokenHash);
      if (row && !row.revokedAt) row.revokedAt = new Date();
    },
    async close() {},
  };
}

export function memoryAlbums(
  assets: Pick<AssetRepository, "get">,
): AlbumRepository & {
  tokenHashes: Set<string>;
  passwordHashes: Set<string>;
  expireShare(shareId: string): void;
  detachAsset(assetId: string): void;
} {
  interface StoredAlbum {
    id: string;
    userId: string;
    title: string;
    themeId: string;
    createdAt: string;
    updatedAt: string;
  }
  interface Membership {
    assetId: string;
    position: number;
    createdAt: string;
  }
  interface StoredShare extends ShareRecord {
    tokenHash: string;
    passwordHash: string | null;
  }

  const albums = new Map<string, StoredAlbum>();
  const membership = new Map<string, Membership[]>();
  const shares = new Map<string, StoredShare>();
  const tokenHashes = new Set<string>();
  const passwordHashes = new Set<string>();
  let clock = Date.parse("2026-04-01T00:00:00.000Z");
  const nowIso = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  const summary = (album: StoredAlbum): AlbumSummary => ({
    ...album,
    assetCount: membership.get(album.id)?.length ?? 0,
  });
  const toShare = (share: StoredShare): ShareRecord => ({
    id: share.id,
    albumId: share.albumId,
    userId: share.userId,
    expiresAt: share.expiresAt,
    revokedAt: share.revokedAt,
    createdAt: share.createdAt,
    passwordProtected: share.passwordHash !== null,
  });
  const activeShare = (tokenHash: string): StoredShare | null => {
    const share = [...shares.values()].find((item) => item.tokenHash === tokenHash);
    if (!share || share.revokedAt) return null;
    if (share.expiresAt && Date.parse(share.expiresAt) <= Date.now()) return null;
    return share;
  };

  return {
    tokenHashes,
    passwordHashes,
    async ready() {},
    detachAsset(assetId: string) {
      for (const [albumId, rows] of membership) {
        membership.set(
          albumId,
          rows.filter((item) => item.assetId !== assetId),
        );
      }
    },
    async createAlbum(input: NewAlbum): Promise<CreateAlbumResult> {
      const owned = [...albums.values()].filter((album) => album.userId === input.userId);
      if (owned.length >= MAX_ALBUMS_PER_USER) return { ok: false, reason: "album_limit" };
      const assetIds: string[] = [];
      const seen = new Set<string>();
      for (const assetId of input.assetIds ?? []) {
        if (seen.has(assetId)) continue;
        seen.add(assetId);
        assetIds.push(assetId);
      }
      if (assetIds.length > MAX_ASSETS_PER_ALBUM) return { ok: false, reason: "too_many" };
      for (const assetId of assetIds) {
        const asset = await assets.get(assetId);
        if (!asset || asset.userId !== input.userId) return { ok: false, reason: "asset_not_found" };
      }
      const stamp = nowIso();
      const album: StoredAlbum = {
        id: input.id,
        userId: input.userId,
        title: input.title,
        themeId: input.themeId,
        createdAt: stamp,
        updatedAt: stamp,
      };
      albums.set(album.id, album);
      const rows: Membership[] = [];
      let position = 0;
      for (const assetId of assetIds) {
        position += 1;
        rows.push({ assetId, position, createdAt: stamp });
      }
      membership.set(album.id, rows);
      return { ok: true, album: summary(album) };
    },
    async listAlbums(userId) {
      return [...albums.values()]
        .filter((album) => album.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((album) => summary(album));
    },
    async getOwnedAlbum(id, userId) {
      const album = albums.get(id);
      if (!album || album.userId !== userId) return null;
      return summary(album);
    },
    async listOwnedAssets(albumId, userId) {
      const album = albums.get(albumId);
      if (!album || album.userId !== userId) return null;
      const rows: AssetRecord[] = [];
      for (const item of membership.get(albumId) ?? []) {
        const asset = await assets.get(item.assetId);
        if (asset && asset.userId === userId) rows.push(asset);
      }
      return rows;
    },
    async addAssets(albumId, userId, assetIds): Promise<AddAssetsResult> {
      const album = albums.get(albumId);
      if (!album || album.userId !== userId) return { ok: false, reason: "album_not_found" };
      for (const assetId of assetIds) {
        const asset = await assets.get(assetId);
        if (!asset || asset.userId !== userId) return { ok: false, reason: "asset_not_found" };
      }
      const rows = membership.get(albumId) ?? [];
      const have = new Set(rows.map((item) => item.assetId));
      const fresh = [...new Set(assetIds)].filter((id) => !have.has(id));
      if (rows.length + fresh.length > MAX_ASSETS_PER_ALBUM) {
        return { ok: false, reason: "too_many" };
      }
      let position = rows.reduce((max, item) => Math.max(max, item.position), 0);
      for (const assetId of fresh) {
        position += 1;
        rows.push({ assetId, position, createdAt: nowIso() });
      }
      membership.set(albumId, rows);
      if (fresh.length > 0) album.updatedAt = nowIso();
      return { ok: true, assetIds: rows.map((item) => item.assetId) };
    },
    async createShare(input: NewShare): Promise<CreateShareResult> {
      const album = albums.get(input.albumId);
      if (!album || album.userId !== input.userId) return { ok: false, reason: "album_not_found" };
      const share: StoredShare = {
        id: input.id,
        albumId: album.id,
        userId: album.userId,
        tokenHash: input.tokenHash,
        passwordHash: input.passwordHash,
        passwordProtected: input.passwordHash !== null,
        expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
        revokedAt: null,
        createdAt: nowIso(),
      };
      shares.set(share.id, share);
      tokenHashes.add(input.tokenHash);
      if (input.passwordHash) passwordHashes.add(input.passwordHash);
      return { ok: true, share: toShare(share) };
    },
    async listShares(albumId, userId) {
      const album = albums.get(albumId);
      if (!album || album.userId !== userId) return null;
      return [...shares.values()]
        .filter((share) => share.albumId === albumId && share.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((share) => toShare(share));
    },
    async revokeShare(shareId, userId) {
      const share = shares.get(shareId);
      if (!share || share.userId !== userId) return null;
      if (!share.revokedAt) share.revokedAt = new Date().toISOString();
      return toShare(share);
    },
    async findActiveShareGate(tokenHash) {
      const share = activeShare(tokenHash);
      if (!share) return null;
      const album = albums.get(share.albumId);
      if (!album || album.userId !== share.userId) return null;
      return { shareId: share.id, passwordHash: share.passwordHash, themeId: album.themeId };
    },
    async findActiveShareByTokenHash(
      tokenHash,
      access: ShareReadAccess = "public",
    ): Promise<PublicShareView | null> {
      const share = activeShare(tokenHash);
      if (!share) return null;
      if (access !== "granted" && share.passwordHash) return null;
      const album = albums.get(share.albumId);
      if (!album || album.userId !== share.userId) return null;
      const viewAssets: PublicShareView["assets"] = [];
      for (const item of membership.get(album.id) ?? []) {
        const asset = await assets.get(item.assetId);
        if (!asset || asset.userId !== album.userId) continue;
        viewAssets.push({
          assetId: asset.id,
          filename: asset.filename,
          width: asset.width,
          height: asset.height,
          derivatives: asset.derivatives,
        });
      }
      return {
        shareId: share.id,
        albumId: album.id,
        userId: album.userId,
        title: album.title,
        themeId: album.themeId,
        assets: viewAssets,
      };
    },
    async close() {},
    expireShare(shareId: string) {
      const share = shares.get(shareId);
      if (!share) throw new Error("missing share");
      share.expiresAt = new Date(Date.now() - 60_000).toISOString();
    },
  };
}

export function fakeObjects(options?: {
  head?: HeadResult | null;
  presignError?: Error;
  presignGetError?: Error;
}): ObjectStore & {
  presigns: PresignPutInput[];
  presignGets: string[];
  heads: string[];
  deletes: string[];
} {
  return {
    presigns: [],
    presignGets: [],
    heads: [],
    deletes: [],
    async presignPut(input) {
      this.presigns.push(input);
      if (options?.presignError) throw options.presignError;
      return {
        url: `http://127.0.0.1:9000/memora-local/${input.key}?X-Amz-Signature=supersecret`,
        expiresAt: new Date("2026-01-01T00:10:00.000Z"),
        headers: {
          "Content-Type": input.contentType,
          "Content-Length": String(input.contentLength),
        },
      };
    },
    async presignGet(input) {
      this.presignGets.push(input.key);
      if (options?.presignGetError) throw options.presignGetError;
      return {
        url: `http://127.0.0.1:9000/memora-local/${input.key}?X-Amz-Signature=supersecret`,
        expiresAt: new Date("2026-01-01T00:10:00.000Z"),
      };
    },
    async head(key) {
      this.heads.push(key);
      return options?.head === undefined
        ? { contentLength: 100, contentType: "image/jpeg" }
        : options.head;
    },
    async getBuffer() {
      return Buffer.alloc(0);
    },
    async putObject() {},
    async deleteObject(key: string) {
      this.deletes.push(key);
    },
  };
}

export function fakeJobs(): AssetJobEnqueuer & { calls: unknown[] } {
  return {
    calls: [],
    async enqueuePipeline(input) {
      this.calls.push(input);
    },
    async close() {},
  };
}

export function createTestApp(options?: {
  env?: NodeJS.ProcessEnv;
  assets?: ReturnType<typeof memoryAssets>;
  objects?: ReturnType<typeof fakeObjects>;
  jobs?: ReturnType<typeof fakeJobs>;
  auth?: ReturnType<typeof memoryAuth>;
  albums?: ReturnType<typeof memoryAlbums>;
}) {
  const assets = options?.assets ?? memoryAssets();
  const objects = options?.objects ?? fakeObjects();
  const jobs = options?.jobs ?? fakeJobs();
  const auth = options?.auth ?? memoryAuth();
  const albums = options?.albums ?? memoryAlbums(assets);
  assets.useAlbums?.(albums);
  const config = createConfig(options?.env ?? ENV);
  const app = createApp({ config, assets, objects, jobs, auth, albums });
  return { app, config, assets, objects, jobs, auth, albums };
}

export async function withServer(app: Express, fn: (base: string) => Promise<void>) {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

export async function postJson(
  base: string,
  path: string,
  body: unknown,
  cookie?: string,
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as unknown) : null,
    setCookies: response.headers.getSetCookie(),
    cacheControl: response.headers.get("cache-control"),
    robots: response.headers.get("x-robots-tag"),
    referrerPolicy: response.headers.get("referrer-policy"),
  };
}

export async function getJson(base: string, path: string, cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${base}${path}`, { headers });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as unknown) : null,
    setCookies: response.headers.getSetCookie(),
    cacheControl: response.headers.get("cache-control"),
    robots: response.headers.get("x-robots-tag"),
    referrerPolicy: response.headers.get("referrer-policy"),
  };
}

export function sessionCookieLine(setCookies: string[]): string {
  const line = setCookies.find((item) => item.startsWith("memora_session="));
  if (!line) throw new Error("missing session cookie");
  return line;
}

export async function registerSession(
  base: string,
  email = "owner@memora.test",
  password = TEST_PASSWORD,
) {
  const response = await postJson(base, "/api/v1/auth/register", { email, password });
  assert.equal(response.status, 201);
  const setCookie = sessionCookieLine(response.setCookies);
  const user = (response.body as { user: { id: string; email: string } }).user;
  return {
    cookie: setCookie.split(";")[0] ?? setCookie,
    setCookie,
    user,
    body: response.body,
  };
}
