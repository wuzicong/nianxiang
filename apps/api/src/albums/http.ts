import { randomUUID } from "node:crypto";
import { isSafeStorageId, isShareToken, isThemeId, sharePagePath } from "@memora/shared";
import type { AlbumRepository, AuthRepository, ObjectStore } from "@memora/storage";
import { safeErrorMessage } from "@memora/storage";
import type { Express, Request, Response } from "express";
import { hashPassword } from "../auth/password.js";
import { resolveSession, type PublicUser } from "../auth/service.js";
import { HttpError, asyncRoute } from "../http.js";
import { toPublicAsset } from "../present.js";
import { sharePasswordMatches } from "../shares/password.js";
import { hashShareToken, newShareToken } from "../shares/token.js";
import { asRecord } from "../validate.js";
import { presentAlbum, presentPublicShare, presentShare } from "./present.js";
import {
  parseAlbumTitle,
  parseAssetIds,
  parseExpiresAt,
  parseSharePassword,
  parseThemeId,
} from "./validate.js";

export interface AlbumRouteDeps {
  auth: AuthRepository;
  albums: AlbumRepository;
  objects: ObjectStore;
  /** 为真时新建分享必须带密码。已有的无密码分享仍可公开读取。 */
  sharePasswordRequired: boolean;
}

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

async function requireUser(auth: AuthRepository, req: Request): Promise<PublicUser> {
  await auth.ready();
  const user = await resolveSession(auth, req.header("cookie"));
  if (!user) throw new HttpError(401, "unauthenticated", "请先登录");
  return user;
}

const SHARE_MISSING = { error: "share_not_found", message: "分享不存在" };
const SHARE_UNAVAILABLE = { error: "share_unavailable", message: "无法打开分享" };

/** 上锁挑战只多带模板 id，方便分享页上肤。不带标题、照片、哈希或令牌。 */
function shareLockedBody(themeId: string): {
  error: "password_required";
  message: string;
  passwordRequired: true;
  themeId?: string;
} {
  const body = {
    error: "password_required" as const,
    message: "需要密码",
    passwordRequired: true as const,
  };
  if (!isThemeId(themeId)) return body;
  return { ...body, themeId };
}

function setPublicShareHeaders(res: Response): void {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex");
}

function sendShareJson(
  res: Response,
  status: number,
  body: { error: string; message: string; passwordRequired?: boolean; themeId?: string },
): void {
  setPublicShareHeaders(res);
  res.status(status).json(body);
}

function presentedPassword(value: unknown): string {
  return typeof value === "string" ? value : "\u0000";
}

export function registerAlbumRoutes(app: Express, deps: AlbumRouteDeps): void {
  app.post(
    "/api/v1/albums",
    asyncRoute(async (req, res) => {
      const user = await requireUser(deps.auth, req);
      const body = asRecord(req.body);
      const title = parseAlbumTitle(body.title);
      const themeId = parseThemeId(body.themeId);
      const created = await deps.albums.createAlbum({
        id: randomUUID(),
        userId: user.id,
        title,
        themeId,
      });
      if (!created.ok) {
        if (created.reason === "album_limit") {
          throw new HttpError(409, "album_limit", "相册数量已达上限");
        }
        throw new HttpError(401, "unauthenticated", "请先登录");
      }
      console.log(`[memora-api] album create id=${created.album.id} user=${user.id}`);
      res.status(201).json({ album: presentAlbum(created.album) });
    }),
  );

  app.get(
    "/api/v1/albums",
    asyncRoute(async (req, res) => {
      const user = await requireUser(deps.auth, req);
      const albums = await deps.albums.listAlbums(user.id);
      res.json({ albums: albums.map((album) => presentAlbum(album)) });
    }),
  );

  app.get(
    "/api/v1/albums/:albumId",
    asyncRoute(async (req, res) => {
      const user = await requireUser(deps.auth, req);
      const albumId = param(req.params.albumId);
      if (!isSafeStorageId(albumId)) {
        throw new HttpError(404, "album_not_found", "相册不存在");
      }
      const album = await deps.albums.getOwnedAlbum(albumId, user.id);
      if (!album) throw new HttpError(404, "album_not_found", "相册不存在");
      const assets = await deps.albums.listOwnedAssets(albumId, user.id);
      res.json({
        album: presentAlbum(album),
        assets: (assets ?? []).map((asset) => toPublicAsset(asset)),
      });
    }),
  );

  app.post(
    "/api/v1/albums/:albumId/assets",
    asyncRoute(async (req, res) => {
      const user = await requireUser(deps.auth, req);
      const albumId = param(req.params.albumId);
      if (!isSafeStorageId(albumId)) {
        throw new HttpError(404, "album_not_found", "相册不存在");
      }
      const assetIds = parseAssetIds(asRecord(req.body).assetIds);
      const added = await deps.albums.addAssets(albumId, user.id, assetIds);
      if (!added.ok) {
        if (added.reason === "too_many") {
          throw new HttpError(409, "album_full", "相册里的照片已达上限");
        }
        if (added.reason === "asset_not_found") {
          throw new HttpError(404, "asset_not_found", "素材不存在");
        }
        throw new HttpError(404, "album_not_found", "相册不存在");
      }
      console.log(
        `[memora-api] album assets id=${albumId} user=${user.id} count=${added.assetIds.length}`,
      );
      res.json({ albumId, assetIds: added.assetIds });
    }),
  );

  app.post(
    "/api/v1/albums/:albumId/shares",
    asyncRoute(async (req, res) => {
      const user = await requireUser(deps.auth, req);
      const albumId = param(req.params.albumId);
      if (!isSafeStorageId(albumId)) {
        throw new HttpError(404, "album_not_found", "相册不存在");
      }
      const body = asRecord(req.body);
      const expiresAt = parseExpiresAt(body.expiresAt);
      const password = parseSharePassword(body.password, deps.sharePasswordRequired);
      const token = newShareToken();
      const created = await deps.albums.createShare({
        id: randomUUID(),
        albumId,
        userId: user.id,
        tokenHash: hashShareToken(token),
        expiresAt,
        passwordHash: password === null ? null : await hashPassword(password),
      });
      if (!created.ok) throw new HttpError(404, "album_not_found", "相册不存在");
      console.log(
        `[memora-api] share create id=${created.share.id} album=${albumId} user=${user.id} exp=${created.share.expiresAt ?? "none"} protected=${created.share.passwordProtected ? "yes" : "no"}`,
      );
      res.setHeader("Cache-Control", "private, no-store");
      res.status(201).json({
        share: {
          ...presentShare(created.share),
          token,
          path: sharePagePath(token),
        },
      });
    }),
  );

  app.get(
    "/api/v1/albums/:albumId/shares",
    asyncRoute(async (req, res) => {
      const user = await requireUser(deps.auth, req);
      const albumId = param(req.params.albumId);
      if (!isSafeStorageId(albumId)) {
        throw new HttpError(404, "album_not_found", "相册不存在");
      }
      const shares = await deps.albums.listShares(albumId, user.id);
      if (!shares) throw new HttpError(404, "album_not_found", "相册不存在");
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ shares: shares.map((share) => presentShare(share)) });
    }),
  );

  app.post(
    "/api/v1/shares/:shareId/revoke",
    asyncRoute(async (req, res) => {
      const user = await requireUser(deps.auth, req);
      const shareId = param(req.params.shareId);
      if (!isSafeStorageId(shareId)) {
        throw new HttpError(404, "share_not_found", "分享不存在");
      }
      const share = await deps.albums.revokeShare(shareId, user.id);
      if (!share) throw new HttpError(404, "share_not_found", "分享不存在");
      console.log(`[memora-api] share revoke id=${share.id} user=${user.id}`);
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ share: presentShare(share) });
    }),
  );

  /**
   * 令牌是 256 bit，不能靠猜测枚举分享是否存在。
   * GET：无密码且有效则直接给内容；有密码只返回「需要密码」和模板 id，不给相册标题或照片。
   * 撤销、过期、无效仍是 404「分享不存在」。
   * POST unlock：密码不对、分享不存在、已撤销、已过期都是同一句 401，不写明原因，也不带回模板。
   * 密码只读 JSON 正文，不读 query，避免进访问日志。
   */
  async function sendShareContent(
    res: Response,
    tokenHash: string,
    access: "public" | "granted",
  ): Promise<void> {
    setPublicShareHeaders(res);
    const view = await deps.albums.findActiveShareByTokenHash(tokenHash, access);
    if (!view) {
      sendShareJson(
        res,
        access === "granted" ? 401 : 404,
        access === "granted" ? SHARE_UNAVAILABLE : SHARE_MISSING,
      );
      return;
    }
    let body: Awaited<ReturnType<typeof presentPublicShare>>;
    try {
      body = await presentPublicShare(view, deps.objects);
    } catch (err) {
      console.error("[memora-api] share presign failed", safeErrorMessage(err));
      throw new HttpError(502, "presign_failed", "签发读取地址失败");
    }
    console.log(
      `[memora-api] share read id=${view.shareId} album=${view.albumId} assets=${view.assets.length}`,
    );
    setPublicShareHeaders(res);
    res.json(body);
  }

  app.get(
    "/api/v1/public/shares/:token",
    asyncRoute(async (req, res) => {
      const token = param(req.params.token);
      if (!isShareToken(token)) {
        sendShareJson(res, 404, SHARE_MISSING);
        return;
      }
      const tokenHash = hashShareToken(token);
      const gate = await deps.albums.findActiveShareGate(tokenHash);
      if (!gate) {
        sendShareJson(res, 404, SHARE_MISSING);
        return;
      }
      if (gate.passwordHash) {
        sendShareJson(res, 401, shareLockedBody(gate.themeId));
        return;
      }
      await sendShareContent(res, tokenHash, "public");
    }),
  );

  app.post(
    "/api/v1/public/shares/:token/unlock",
    asyncRoute(async (req, res) => {
      const token = param(req.params.token);
      if (!isShareToken(token)) {
        sendShareJson(res, 404, SHARE_MISSING);
        return;
      }
      const tokenHash = hashShareToken(token);
      const supplied = presentedPassword(asRecord(req.body).password);
      const gate = await deps.albums.findActiveShareGate(tokenHash);
      const matches = await sharePasswordMatches(supplied, gate?.passwordHash ?? null);
      if (!gate || (gate.passwordHash !== null && !matches)) {
        sendShareJson(res, 401, SHARE_UNAVAILABLE);
        return;
      }
      await sendShareContent(res, tokenHash, gate.passwordHash === null ? "public" : "granted");
    }),
  );
}
