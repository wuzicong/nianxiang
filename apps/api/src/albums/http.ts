import { randomUUID } from "node:crypto";
import { isSafeStorageId, isShareToken, sharePagePath } from "@memora/shared";
import type { AlbumRepository, AuthRepository, ObjectStore } from "@memora/storage";
import { safeErrorMessage } from "@memora/storage";
import type { Express, Request, Response } from "express";
import { resolveSession, type PublicUser } from "../auth/service.js";
import { HttpError, asyncRoute } from "../http.js";
import { toPublicAsset } from "../present.js";
import { hashShareToken, newShareToken } from "../shares/token.js";
import { asRecord } from "../validate.js";
import { presentAlbum, presentPublicShare, presentShare } from "./present.js";
import { parseAlbumTitle, parseAssetIds, parseExpiresAt, parseThemeId } from "./validate.js";

export interface AlbumRouteDeps {
  auth: AuthRepository;
  albums: AlbumRepository;
  objects: ObjectStore;
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

function sendShareMissing(res: Response): void {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex");
  res.status(404).json({ error: "share_not_found", message: "分享不存在" });
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
      const expiresAt = parseExpiresAt(asRecord(req.body).expiresAt);
      const token = newShareToken();
      const created = await deps.albums.createShare({
        id: randomUUID(),
        albumId,
        userId: user.id,
        tokenHash: hashShareToken(token),
        expiresAt,
      });
      if (!created.ok) throw new HttpError(404, "album_not_found", "相册不存在");
      console.log(
        `[memora-api] share create id=${created.share.id} album=${albumId} user=${user.id} exp=${created.share.expiresAt ?? "none"}`,
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

  app.get(
    "/api/v1/public/shares/:token",
    asyncRoute(async (req, res) => {
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Robots-Tag", "noindex");
      const token = param(req.params.token);
      if (!isShareToken(token)) {
        sendShareMissing(res);
        return;
      }
      const view = await deps.albums.findActiveShareByTokenHash(hashShareToken(token));
      if (!view) {
        sendShareMissing(res);
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
      res.json(body);
    }),
  );
}
