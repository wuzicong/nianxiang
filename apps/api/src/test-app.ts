import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { originalObjectKey } from "@memora/shared";
import {
  EmailTakenError,
  type AssetRecord,
  type AssetRepository,
  type AuthRepository,
  type AuthUser,
  type HeadResult,
  type NewAsset,
  type NewAuthSession,
  type NewAuthUser,
  type ObjectStore,
  type PresignPutInput,
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

export function memoryAssets(
  seed: AssetRecord[] = [],
): AssetRepository & { rows: Map<string, AssetRecord> } {
  const rows = new Map(seed.map((row) => [row.id, row]));
  return {
    rows,
    async ready() {},
    async insertPending(asset: NewAsset) {
      rows.set(
        asset.id,
        record({
          id: asset.id,
          userId: asset.userId,
          storageKey: asset.storageKey,
          filename: asset.filename,
          contentType: asset.contentType,
          sizeBytes: asset.sizeBytes,
          status: "pending_upload",
        }),
      );
    },
    async deletePending(id) {
      const current = rows.get(id);
      if (current?.status === "pending_upload") rows.delete(id);
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

export function fakeObjects(options?: {
  head?: HeadResult | null;
  presignError?: Error;
}): ObjectStore & { presigns: PresignPutInput[]; heads: string[] } {
  return {
    presigns: [],
    heads: [],
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
}) {
  const assets = options?.assets ?? memoryAssets();
  const objects = options?.objects ?? fakeObjects();
  const jobs = options?.jobs ?? fakeJobs();
  const auth = options?.auth ?? memoryAuth();
  const config = createConfig(options?.env ?? ENV);
  const app = createApp({ config, assets, objects, jobs, auth });
  return { app, config, assets, objects, jobs, auth };
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
