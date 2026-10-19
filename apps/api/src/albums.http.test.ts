import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { derivativeObjectKey, originalObjectKey } from "@memora/shared";
import { MAX_ALBUMS_PER_USER, MAX_ASSETS_PER_ALBUM } from "@memora/storage";
import { hashShareToken } from "./shares/token.js";
import {
  ENV,
  createTestApp,
  fakeObjects,
  getJson,
  memoryAlbums,
  memoryAssets,
  postJson,
  record,
  registerSession,
  withServer,
} from "./test-app.js";

const MISSING_SHARE = { error: "share_not_found", message: "分享不存在" };

function captureLogs() {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  return {
    lines,
    restore() {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

test("owner can create albums, add only their assets, and list them", async () => {
  const assets = memoryAssets();
  const albums = memoryAlbums(assets);
  const { app } = createTestApp({ assets, albums, objects: fakeObjects(), jobs: undefined });
  await withServer(app, async (base) => {
    const owner = await registerSession(base, "owner@memora.test");
    const other = await registerSession(base, "other@memora.test");
    const own = record({
      id: randomUUID(),
      userId: owner.user.id,
      status: "ready",
      filename: "harbor.jpg",
    });
    const foreign = record({
      id: randomUUID(),
      userId: other.user.id,
      status: "ready",
      filename: "secret.jpg",
    });
    assets.rows.set(own.id, own);
    assets.rows.set(foreign.id, foreign);

    const anon = await postJson(base, "/api/v1/albums", { title: "周末" });
    assert.equal(anon.status, 401);

    const created = await postJson(
      base,
      "/api/v1/albums",
      { title: " 京都周末 ", themeId: "kyoto-lantern", userId: other.user.id },
      owner.cookie,
    );
    assert.equal(created.status, 201);
    const album = (created.body as { album: { albumId: string; userId: string; themeId: string; title: string } })
      .album;
    assert.equal(album.title, "京都周末");
    assert.equal(album.themeId, "kyoto-lantern");
    assert.equal(album.userId, owner.user.id);

    const defaults = await postJson(base, "/api/v1/albums", { title: "默认" }, owner.cookie);
    assert.equal(defaults.status, 201);
    assert.equal(
      (defaults.body as { album: { themeId: string } }).album.themeId,
      "cotton-candy",
    );

    const badTheme = await postJson(
      base,
      "/api/v1/albums",
      { title: "不存在", themeId: "no-such-theme" },
      owner.cookie,
    );
    assert.equal(badTheme.status, 400);
    assert.equal((badTheme.body as { error: string }).error, "invalid_theme");

    const mixed = await postJson(
      base,
      `/api/v1/albums/${album.albumId}/assets`,
      { assetIds: [own.id, foreign.id] },
      owner.cookie,
    );
    assert.equal(mixed.status, 404);
    assert.equal((mixed.body as { error: string }).error, "asset_not_found");

    const added = await postJson(
      base,
      `/api/v1/albums/${album.albumId}/assets`,
      { assetIds: [own.id, own.id] },
      owner.cookie,
    );
    assert.equal(added.status, 200);
    assert.deepEqual((added.body as { assetIds: string[] }).assetIds, [own.id]);
    const again = await postJson(
      base,
      `/api/v1/albums/${album.albumId}/assets`,
      { assetIds: [own.id] },
      owner.cookie,
    );
    assert.equal(again.status, 200);
    assert.deepEqual((again.body as { assetIds: string[] }).assetIds, [own.id]);

    const stolen = await postJson(
      base,
      `/api/v1/albums/${album.albumId}/assets`,
      { assetIds: [foreign.id] },
      other.cookie,
    );
    assert.equal(stolen.status, 404);
    assert.equal((stolen.body as { error: string }).error, "album_not_found");

    const ownerList = await getJson(base, "/api/v1/albums", owner.cookie);
    const otherList = await getJson(base, "/api/v1/albums", other.cookie);
    assert.equal(ownerList.status, 200);
    assert.equal((ownerList.body as { albums: unknown[] }).albums.length, 2);
    assert.deepEqual((otherList.body as { albums: unknown[] }).albums, []);

    const detail = await getJson(base, `/api/v1/albums/${album.albumId}`, owner.cookie);
    assert.equal(detail.status, 200);
    const detailBody = detail.body as { assets: { assetId: string; filename: string }[] };
    assert.equal(detailBody.assets.length, 1);
    assert.equal(detailBody.assets[0]?.filename, "harbor.jpg");
    const hidden = await getJson(base, `/api/v1/albums/${album.albumId}`, other.cookie);
    assert.equal(hidden.status, 404);
    assert.equal((hidden.body as { error: string }).error, "album_not_found");
  });
});

test("album detail signs derivative previews and omits original keys", async () => {
  const assets = memoryAssets();
  const albums = memoryAlbums(assets);
  const objects = fakeObjects();
  const logs = captureLogs();
  try {
    const { app } = createTestApp({ assets, albums, objects });
    await withServer(app, async (base) => {
      const owner = await registerSession(base, "preview-owner@memora.test");
      const readyId = "ready-photo";
      const thumb = derivativeObjectKey(owner.user.id, readyId, "thumb");
      const preview = derivativeObjectKey(owner.user.id, readyId, "preview");
      const original = originalObjectKey(owner.user.id, readyId);
      assets.rows.set(
        readyId,
        record({
          id: readyId,
          userId: owner.user.id,
          status: "ready",
          filename: "harbor.jpg",
          width: 640,
          height: 480,
          derivatives: { thumb, preview, hero: original },
          exif: { capturedAt: "2020:01:02 03:04:05", hasGps: true, lat: 12.3456, lng: 99.9 },
        }),
      );
      assets.rows.set(
        "processing-photo",
        record({
          id: "processing-photo",
          userId: owner.user.id,
          status: "processing",
          filename: "queue.jpg",
          error: null,
        }),
      );
      const created = await postJson(
        base,
        "/api/v1/albums",
        { title: "海港", themeId: "kyoto-lantern" },
        owner.cookie,
      );
      const albumId = (created.body as { album: { albumId: string } }).album.albumId;
      await postJson(
        base,
        `/api/v1/albums/${albumId}/assets`,
        { assetIds: ["processing-photo", readyId] },
        owner.cookie,
      );

      const detail = await getJson(base, `/api/v1/albums/${albumId}`, owner.cookie);
      assert.equal(detail.status, 200);
      assert.equal(detail.cacheControl, "private, no-store");
      assert.equal(detail.referrerPolicy, "no-referrer");
      const body = detail.body as {
        assets: {
          assetId: string;
          filename: string;
          status: string;
          key?: string;
          userId?: string;
          exif?: unknown;
          derivatives?: unknown;
          error: string | null;
          takenAt?: string | null;
          previews: { thumb?: { url: string }; preview?: { url: string }; hero?: { url: string } };
        }[];
      };
      assert.equal(body.assets[0]?.assetId, "processing-photo");
      assert.equal(body.assets[0]?.status, "processing");
      assert.deepEqual(body.assets[0]?.previews, {});
      assert.equal(body.assets[1]?.filename, "harbor.jpg");
      assert.equal(body.assets[1]?.status, "ready");
      assert.match(body.assets[1]?.previews.thumb?.url ?? "", /\/derivatives\//);
      assert.match(body.assets[1]?.previews.preview?.url ?? "", /\/derivatives\//);
      assert.equal(body.assets[1]?.previews.hero, undefined);
      assert.equal(body.assets[1]?.key, undefined);
      assert.equal(body.assets[1]?.userId, undefined);
      assert.equal(body.assets[1]?.exif, undefined);
      assert.equal(body.assets[1]?.takenAt, "2020-01-02T03:04:05");
      assert.equal(body.assets[1]?.derivatives, undefined);
      const json = JSON.stringify(body);
      assert.equal(json.includes("/originals/"), false);
      assert.equal(json.includes("12.3456"), false);
      assert.equal(json.includes(original), false);
      assert.deepEqual(objects.presignGets, [thumb, preview]);
      assert.equal(logs.lines.join("\n").includes("supersecret"), false);
    });
  } finally {
    logs.restore();
  }
});

test("album detail presign failures do not echo the signed url", async () => {
  const assets = memoryAssets();
  const albums = memoryAlbums(assets);
  const objects = fakeObjects({
    presignGetError: new Error(
      "http://127.0.0.1:9000/memora-local/users/u/derivatives/a/thumb.webp?X-Amz-Signature=supersecret",
    ),
  });
  const logs = captureLogs();
  try {
    const { app } = createTestApp({ assets, albums, objects });
    await withServer(app, async (base) => {
      const owner = await registerSession(base, "album-presign@memora.test");
      const assetId = "broken-preview";
      assets.rows.set(
        assetId,
        record({
          id: assetId,
          userId: owner.user.id,
          status: "ready",
          derivatives: { thumb: derivativeObjectKey(owner.user.id, assetId, "thumb") },
        }),
      );
      const created = await postJson(base, "/api/v1/albums", { title: "失败" }, owner.cookie);
      const albumId = (created.body as { album: { albumId: string } }).album.albumId;
      await postJson(base, `/api/v1/albums/${albumId}/assets`, { assetIds: [assetId] }, owner.cookie);
      const detail = await getJson(base, `/api/v1/albums/${albumId}`, owner.cookie);
      assert.equal(detail.status, 502);
      assert.equal((detail.body as { error: string }).error, "presign_failed");
      assert.equal(JSON.stringify(detail.body).includes("supersecret"), false);
      const text = logs.lines.join("\n");
      assert.equal(text.includes("supersecret"), false);
      assert.equal(text.includes("X-Amz-Signature"), false);
    });
  } finally {
    logs.restore();
  }
});

test("share token is returned once, stored hashed, and dies on revoke or expiry", async () => {
  const assets = memoryAssets();
  const albums = memoryAlbums(assets);
  const objects = fakeObjects();
  const logs = captureLogs();
  try {
    const { app } = createTestApp({ assets, albums, objects });
    await withServer(app, async (base) => {
      const owner = await registerSession(base, "share-owner@memora.test");
      const other = await registerSession(base, "share-other@memora.test");
      const preview = derivativeObjectKey(owner.user.id, "photo1", "preview");
      const thumb = derivativeObjectKey(owner.user.id, "photo1", "thumb");
      const original = originalObjectKey(owner.user.id, "photo1");
      assets.rows.set(
        "photo1",
        record({
          id: "photo1",
          userId: owner.user.id,
          status: "ready",
          filename: "harbor.jpg",
          width: 640,
          height: 480,
          derivatives: { preview, thumb, hero: original },
          exif: { hasGps: true, lat: 12.3456, lng: 99.9 },
        }),
      );
      const createdAlbum = await postJson(
        base,
        "/api/v1/albums",
        { title: "海港", themeId: "magazine-heirloom" },
        owner.cookie,
      );
      const albumId = (createdAlbum.body as { album: { albumId: string } }).album.albumId;
      await postJson(base, `/api/v1/albums/${albumId}/assets`, { assetIds: ["photo1"] }, owner.cookie);

      const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
      const created = await postJson(
        base,
        `/api/v1/albums/${albumId}/shares`,
        { expiresAt },
        owner.cookie,
      );
      assert.equal(created.status, 201);
      assert.equal(created.cacheControl, "private, no-store");
      const share = (
        created.body as {
          share: {
            shareId: string;
            token: string;
            path: string;
            expiresAt: string;
            revokedAt: null;
            passwordProtected: boolean;
          };
        }
      ).share;
      assert.equal(share.revokedAt, null);
      assert.equal(share.passwordProtected, false);
      assert.equal(share.path, `/s/${share.token}`);
      assert.equal(albums.tokenHashes.has(share.token), false);
      assert.equal(albums.tokenHashes.has(hashShareToken(share.token)), true);
      assert.equal(JSON.stringify(albums.tokenHashes).includes(share.token), false);

      const listed = await getJson(base, `/api/v1/albums/${albumId}/shares`, owner.cookie);
      assert.equal(listed.status, 200);
      assert.equal(JSON.stringify(listed.body).includes(share.token), false);
      assert.equal(JSON.stringify(listed.body).includes(hashShareToken(share.token)), false);

      const otherShares = await getJson(base, `/api/v1/albums/${albumId}/shares`, other.cookie);
      assert.equal(otherShares.status, 404);
      const beforeDenied = albums.tokenHashes.size;
      const deniedCreate = await postJson(
        base,
        `/api/v1/albums/${albumId}/shares`,
        {},
        other.cookie,
      );
      assert.equal(deniedCreate.status, 404);
      assert.equal(albums.tokenHashes.size, beforeDenied);

      const pub = await getJson(base, `/api/v1/public/shares/${share.token}`);
      assert.equal(pub.status, 200);
      assert.equal(pub.cacheControl, "private, no-store");
      assert.equal(pub.robots, "noindex");
      assert.equal(pub.referrerPolicy, "no-referrer");
      assert.equal(pub.setCookies.length, 0);
      const body = pub.body as {
        album: { title: string; themeId: string; userId?: string };
        assets: {
          filename: string;
          takenAt?: string | null;
          derivatives: { thumb?: { url: string }; preview?: { url: string }; hero?: { url: string } };
        }[];
      };
      assert.equal(body.album.title, "海港");
      assert.equal(body.album.themeId, "magazine-heirloom");
      assert.equal(body.album.userId, undefined);
      assert.equal(body.assets[0]?.filename, "");
      assert.equal(body.assets[0]?.takenAt, null);
      assert.equal(body.assets[0]?.derivatives.hero, undefined);
      assert.match(body.assets[0]?.derivatives.preview?.url ?? "", /derivatives/);
      assert.deepEqual(objects.presignGets, [thumb, preview]);
      const pubJson = JSON.stringify(body);
      assert.equal(pubJson.includes("/originals/"), false);
      assert.equal(pubJson.includes(original), false);
      assert.equal(pubJson.includes("12.3456"), false);
      assert.equal(pubJson.includes("harbor.jpg"), false);
      assert.equal(pubJson.includes("hasGps"), false);
      assert.equal(pubJson.includes("capturedAt"), false);
      assert.equal(pubJson.includes(owner.user.email), false);
      assert.equal(pubJson.includes(share.token), false);

      const asOther = await getJson(base, `/api/v1/public/shares/${share.token}`, other.cookie);
      assert.equal(asOther.status, 200);

      const second = await postJson(base, `/api/v1/albums/${albumId}/shares`, {}, owner.cookie);
      const secondToken = (second.body as { share: { token: string; shareId: string } }).share.token;
      const secondId = (second.body as { share: { shareId: string } }).share.shareId;

      const revoked = await postJson(base, `/api/v1/shares/${share.shareId}/revoke`, {}, owner.cookie);
      assert.equal(revoked.status, 200);
      const revokedAt = (revoked.body as { share: { revokedAt: string } }).share.revokedAt;
      assert.ok(revokedAt);
      const again = await postJson(base, `/api/v1/shares/${share.shareId}/revoke`, {}, owner.cookie);
      assert.equal(again.status, 200);
      assert.equal((again.body as { share: { revokedAt: string } }).share.revokedAt, revokedAt);

      const cross = await postJson(base, `/api/v1/shares/${secondId}/revoke`, {}, other.cookie);
      assert.equal(cross.status, 404);
      assert.deepEqual(cross.body, MISSING_SHARE);

      const alive = await getJson(base, `/api/v1/public/shares/${secondToken}`);
      assert.equal(alive.status, 200);
      const dead = await getJson(base, `/api/v1/public/shares/${share.token}`);
      const unknown = await getJson(base, `/api/v1/public/shares/${"b".repeat(43)}`);
      const malformed = await getJson(base, "/api/v1/public/shares/not-a-token");
      albums.expireShare(secondId);
      const expired = await getJson(base, `/api/v1/public/shares/${secondToken}`);
      for (const response of [dead, unknown, malformed, expired]) {
        assert.equal(response.status, 404);
        assert.deepEqual(response.body, MISSING_SHARE);
        assert.equal(response.cacheControl, "private, no-store");
        assert.equal(JSON.stringify(response.body).includes("撤销"), false);
        assert.equal(JSON.stringify(response.body).includes("过期"), false);
      }
      assert.equal(logs.lines.join("\n").includes(share.token), false);
      assert.equal(logs.lines.join("\n").includes(secondToken), false);
      assert.equal(logs.lines.join("\n").includes("supersecret"), false);
    });
  } finally {
    logs.restore();
  }
});

test("public share serializes takenAt and does not leak filenames", async () => {
  const assets = memoryAssets();
  const albums = memoryAlbums(assets);
  const objects = fakeObjects();
  const { app } = createTestApp({ assets, albums, objects });
  await withServer(app, async (base) => {
    const owner = await registerSession(base, "caption@memora.test");
    const datedId = "dated-photo";
    const plainId = "plain-photo";
    const datedPreview = derivativeObjectKey(owner.user.id, datedId, "preview");
    const plainName = "2024-05-12-trip.jpg";
    assets.rows.set(
      datedId,
      record({
        id: datedId,
        userId: owner.user.id,
        status: "ready",
        filename: "IMG_20240512.JPG",
        width: 640,
        height: 480,
        derivatives: { preview: datedPreview, hero: originalObjectKey(owner.user.id, datedId) },
        exif: {
          capturedAt: "2024:05:12 08:00:00",
          hasGps: true,
          lat: 35.0001,
          lng: 139.0001,
          format: "jpeg",
        },
      }),
    );
    assets.rows.set(
      plainId,
      record({
        id: plainId,
        userId: owner.user.id,
        status: "ready",
        filename: plainName,
        derivatives: { preview: derivativeObjectKey(owner.user.id, plainId, "preview") },
        exif: { hasGps: true, lat: 48.1234, lng: 2.5678 },
      }),
    );
    const created = await postJson(
      base,
      "/api/v1/albums",
      { title: "短注", themeId: "kyoto-lantern" },
      owner.cookie,
    );
    const albumId = (created.body as { album: { albumId: string } }).album.albumId;
    await postJson(
      base,
      `/api/v1/albums/${albumId}/assets`,
      { assetIds: [datedId, plainId] },
      owner.cookie,
    );
    const share = await postJson(base, `/api/v1/albums/${albumId}/shares`, {}, owner.cookie);
    const token = (share.body as { share: { token: string } }).share.token;
    const pub = await getJson(base, `/api/v1/public/shares/${token}`);
    assert.equal(pub.status, 200);
    const body = pub.body as {
      assets: {
        assetId: string;
        filename: string;
        takenAt: string | null;
        exif?: unknown;
        capturedAt?: unknown;
      }[];
    };
    assert.equal(body.assets[0]?.assetId, datedId);
    assert.equal(body.assets[0]?.takenAt, "2024-05-12T08:00:00");
    assert.equal(body.assets[0]?.filename, "");
    assert.equal(body.assets[1]?.assetId, plainId);
    assert.equal(body.assets[1]?.takenAt, null);
    assert.equal(body.assets[1]?.filename, "");
    assert.equal(body.assets[0]?.exif, undefined);
    assert.equal(body.assets[0]?.capturedAt, undefined);
    const json = JSON.stringify(body);
    assert.equal(json.includes("IMG_20240512.JPG"), false);
    assert.equal(json.includes(plainName), false);
    assert.equal(json.includes("2024:05:12"), false);
    assert.equal(json.includes("35.0001"), false);
    assert.equal(json.includes("139.0001"), false);
    assert.equal(json.includes("48.1234"), false);
    assert.equal(json.includes("2.5678"), false);
    assert.equal(json.includes("hasGps"), false);
    assert.equal(json.includes("jpeg"), false);
    assert.equal(json.includes("/originals/"), false);
    assert.equal(json.includes("capturedAt"), false);
  });
});

test("share presign failures do not log the capability token", async () => {
  const leaked = `${"c".repeat(42)}-`;
  const assets = memoryAssets();
  const albums = memoryAlbums(assets);
  const objects = fakeObjects({
    presignGetError: new Error(
      `GET /s/${leaked} /api/v1/public/shares/${leaked} http://127.0.0.1:9000/memora-local/k?X-Amz-Signature=supersecret`,
    ),
  });
  const logs = captureLogs();
  try {
    const { app } = createTestApp({ assets, albums, objects });
    await withServer(app, async (base) => {
      const owner = await registerSession(base, "presign@memora.test");
      const assetId = "photo2";
      assets.rows.set(
        assetId,
        record({
          id: assetId,
          userId: owner.user.id,
          status: "ready",
          derivatives: { preview: derivativeObjectKey(owner.user.id, assetId, "preview") },
        }),
      );
      const album = await postJson(base, "/api/v1/albums", { title: "失败" }, owner.cookie);
      const albumId = (album.body as { album: { albumId: string } }).album.albumId;
      await postJson(base, `/api/v1/albums/${albumId}/assets`, { assetIds: [assetId] }, owner.cookie);
      const share = await postJson(base, `/api/v1/albums/${albumId}/shares`, {}, owner.cookie);
      const token = (share.body as { share: { token: string } }).share.token;
      const failed = await getJson(base, `/api/v1/public/shares/${token}`);
      assert.equal(failed.status, 502);
      assert.equal((failed.body as { error: string }).error, "presign_failed");
      const text = logs.lines.join("\n");
      assert.equal(text.includes(token), false);
      assert.equal(text.includes(leaked), false);
      assert.equal(text.includes("supersecret"), false);
    });
  } finally {
    logs.restore();
  }
});

test("optional share password is hashed, challenged, and not echoed", async () => {
  const secret = "share-secret-1";
  const assets = memoryAssets();
  const albums = memoryAlbums(assets);
  const objects = fakeObjects();
  const logs = captureLogs();
  const unavailable = { error: "share_unavailable", message: "无法打开分享" };
  try {
    const { app } = createTestApp({ assets, albums, objects });
    await withServer(app, async (base) => {
      const owner = await registerSession(base, "pw-share@memora.test");
      const assetId = "photo-locked";
      const preview = derivativeObjectKey(owner.user.id, assetId, "preview");
      assets.rows.set(
        assetId,
        record({
          id: assetId,
          userId: owner.user.id,
          status: "ready",
          filename: "harbor.jpg",
          derivatives: { preview, hero: originalObjectKey(owner.user.id, assetId) },
          exif: { capturedAt: "2020:01:02 03:04:05", hasGps: true, lat: 12.3456, lng: 99.9 },
        }),
      );
      const album = await postJson(
        base,
        "/api/v1/albums",
        { title: "上锁的海港", themeId: "kyoto-lantern" },
        owner.cookie,
      );
      const albumId = (album.body as { album: { albumId: string } }).album.albumId;
      await postJson(base, `/api/v1/albums/${albumId}/assets`, { assetIds: [assetId] }, owner.cookie);

      const weak = await postJson(
        base,
        `/api/v1/albums/${albumId}/shares`,
        { password: "short" },
        owner.cookie,
      );
      assert.equal(weak.status, 400);
      assert.equal((weak.body as { error: string }).error, "weak_password");
      assert.equal(albums.passwordHashes.size, 0);
      assert.equal(albums.tokenHashes.size, 0);

      const created = await postJson(
        base,
        `/api/v1/albums/${albumId}/shares`,
        { password: secret, ignored: secret },
        owner.cookie,
      );
      assert.equal(created.status, 201);
      const share = (
        created.body as {
          share: { shareId: string; token: string; path: string; passwordProtected: boolean };
        }
      ).share;
      assert.equal(share.passwordProtected, true);
      assert.equal(share.path, `/s/${share.token}`);
      const createdJson = JSON.stringify(created.body);
      assert.equal(createdJson.includes(secret), false);
      assert.equal(createdJson.includes("scrypt$"), false);
      assert.equal([...albums.passwordHashes].some((item) => item.includes(secret)), false);
      assert.match([...albums.passwordHashes][0] ?? "", /^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);

      const listed = await getJson(base, `/api/v1/albums/${albumId}/shares`, owner.cookie);
      assert.equal(JSON.stringify(listed.body).includes(secret), false);
      assert.equal(JSON.stringify(listed.body).includes("scrypt$"), false);
      assert.equal(
        (listed.body as { shares: { passwordProtected: boolean }[] }).shares[0]?.passwordProtected,
        true,
      );

      const challenged = await getJson(base, `/api/v1/public/shares/${share.token}`);
      assert.equal(challenged.status, 401);
      assert.deepEqual(challenged.body, {
        error: "password_required",
        message: "需要密码",
        passwordRequired: true,
        themeId: "kyoto-lantern",
      });
      assert.equal(challenged.cacheControl, "private, no-store");
      assert.equal(challenged.robots, "noindex");
      assert.equal(challenged.referrerPolicy, "no-referrer");
      assert.equal(JSON.stringify(challenged.body).includes("上锁的海港"), false);
      assert.equal(objects.presignGets.length, 0);

      const viaQuery = await getJson(
        base,
        `/api/v1/public/shares/${share.token}?password=${encodeURIComponent(secret)}`,
      );
      assert.equal(viaQuery.status, 401);
      assert.equal((viaQuery.body as { passwordRequired?: boolean }).passwordRequired, true);
      assert.equal(objects.presignGets.length, 0);

      const wrong = await postJson(base, `/api/v1/public/shares/${share.token}/unlock`, {
        password: "not-the-share-password",
      });
      const unknown = await postJson(base, `/api/v1/public/shares/${"d".repeat(43)}/unlock`, {
        password: "not-the-share-password",
      });
      const empty = await postJson(base, `/api/v1/public/shares/${share.token}/unlock`, {});
      for (const response of [wrong, unknown, empty]) {
        assert.equal(response.status, 401);
        assert.deepEqual(response.body, unavailable);
        assert.equal(response.cacheControl, "private, no-store");
        assert.equal(response.robots, "noindex");
        assert.equal(JSON.stringify(response.body).includes(secret), false);
        assert.equal(JSON.stringify(response.body).includes("密码错"), false);
      }
      assert.equal(objects.presignGets.length, 0);

      const malformed = await postJson(base, "/api/v1/public/shares/not-a-token/unlock", {
        password: secret,
      });
      assert.equal(malformed.status, 404);
      assert.deepEqual(malformed.body, MISSING_SHARE);

      const opened = await postJson(base, `/api/v1/public/shares/${share.token}/unlock`, {
        password: secret,
      });
      assert.equal(opened.status, 200);
      assert.equal(opened.setCookies.length, 0);
      const openedBody = opened.body as {
        album: { title: string };
        assets: {
          filename?: string;
          takenAt?: string | null;
          derivatives: { preview?: { url: string }; hero?: { url: string } };
        }[];
      };
      assert.equal(openedBody.album.title, "上锁的海港");
      assert.equal(openedBody.assets[0]?.filename, "");
      assert.equal(openedBody.assets[0]?.takenAt, "2020-01-02T03:04:05");
      assert.match(openedBody.assets[0]?.derivatives.preview?.url ?? "", /derivatives/);
      assert.equal(openedBody.assets[0]?.derivatives.hero, undefined);
      const openedJson = JSON.stringify(openedBody);
      assert.equal(openedJson.includes(secret), false);
      assert.equal(openedJson.includes(share.token), false);
      assert.equal(openedJson.includes("harbor.jpg"), false);
      assert.equal(openedJson.includes("12.3456"), false);
      assert.equal(openedJson.includes("2020:01:02"), false);
      assert.equal(openedJson.includes("capturedAt"), false);
      assert.equal(openedJson.includes("hasGps"), false);
      assert.deepEqual(objects.presignGets, [preview]);

      const openShare = await postJson(base, `/api/v1/albums/${albumId}/shares`, {}, owner.cookie);
      const openToken = (openShare.body as { share: { token: string } }).share.token;
      const stillOpen = await getJson(base, `/api/v1/public/shares/${openToken}`);
      assert.equal(stillOpen.status, 200);
      const ignoredPassword = await postJson(base, `/api/v1/public/shares/${openToken}/unlock`, {
        password: "ignored-password",
      });
      assert.equal(ignoredPassword.status, 200);

      const revoked = await postJson(base, `/api/v1/shares/${share.shareId}/revoke`, {}, owner.cookie);
      assert.equal(revoked.status, 200);
      const deadGet = await getJson(base, `/api/v1/public/shares/${share.token}`);
      assert.equal(deadGet.status, 404);
      assert.deepEqual(deadGet.body, MISSING_SHARE);
      const deadPost = await postJson(base, `/api/v1/public/shares/${share.token}/unlock`, {
        password: secret,
      });
      assert.equal(deadPost.status, 401);
      assert.deepEqual(deadPost.body, unavailable);
      assert.deepEqual(deadPost.body, unknown.body);

      const expiring = await postJson(
        base,
        `/api/v1/albums/${albumId}/shares`,
        { password: secret },
        owner.cookie,
      );
      const expiringShare = (
        expiring.body as { share: { shareId: string; token: string } }
      ).share;
      albums.expireShare(expiringShare.shareId);
      const expiredGet = await getJson(base, `/api/v1/public/shares/${expiringShare.token}`);
      const expiredPost = await postJson(
        base,
        `/api/v1/public/shares/${expiringShare.token}/unlock`,
        { password: secret },
      );
      assert.equal(expiredGet.status, 404);
      assert.deepEqual(expiredGet.body, MISSING_SHARE);
      assert.equal(expiredPost.status, 401);
      assert.deepEqual(expiredPost.body, unavailable);

      const weird = await albums.createAlbum({
        id: "weird-theme-album",
        userId: owner.user.id,
        title: "不该出现的标题",
        themeId: "not-a-theme",
      });
      assert.equal(weird.ok, true);
      const weirdShare = await postJson(
        base,
        "/api/v1/albums/weird-theme-album/shares",
        { password: secret },
        owner.cookie,
      );
      assert.equal(weirdShare.status, 201);
      const weirdToken = (weirdShare.body as { share: { token: string } }).share.token;
      const weirdChallenge = await getJson(base, `/api/v1/public/shares/${weirdToken}`);
      assert.equal(weirdChallenge.status, 401);
      assert.deepEqual(weirdChallenge.body, {
        error: "password_required",
        message: "需要密码",
        passwordRequired: true,
      });
      assert.equal(JSON.stringify(weirdChallenge.body).includes("不该出现的标题"), false);
      assert.equal(JSON.stringify(weirdChallenge.body).includes("not-a-theme"), false);

      const text = logs.lines.join("\n");
      assert.equal(text.includes(secret), false);
      assert.equal(text.includes(share.token), false);
      assert.equal(text.includes("scrypt$"), false);
    });
  } finally {
    logs.restore();
  }
});

test("SHARE_REQUIRE_PASSWORD forces a password on new shares only", async () => {
  const secret = "required-share-pw";
  const assets = memoryAssets();
  const albums = memoryAlbums(assets);
  const logs = captureLogs();
  try {
    const { app } = createTestApp({
      assets,
      albums,
      objects: fakeObjects(),
      env: { ...ENV, SHARE_REQUIRE_PASSWORD: "true" },
    });
    await withServer(app, async (base) => {
      const owner = await registerSession(base, "require-pw@memora.test");
      const album = await postJson(base, "/api/v1/albums", { title: "必须有密码" }, owner.cookie);
      const albumId = (album.body as { album: { albumId: string } }).album.albumId;
      const missing = await postJson(base, `/api/v1/albums/${albumId}/shares`, {}, owner.cookie);
      assert.equal(missing.status, 400);
      assert.equal((missing.body as { error: string }).error, "password_required");
      assert.equal(albums.tokenHashes.size, 0);
      const created = await postJson(
        base,
        `/api/v1/albums/${albumId}/shares`,
        { password: secret },
        owner.cookie,
      );
      assert.equal(created.status, 201);
      assert.equal(JSON.stringify(created.body).includes(secret), false);
      const token = (created.body as { share: { token: string } }).share.token;
      const challenged = await getJson(base, `/api/v1/public/shares/${token}`);
      assert.equal(challenged.status, 401);
      assert.deepEqual(challenged.body, {
        error: "password_required",
        message: "需要密码",
        passwordRequired: true,
        themeId: "cotton-candy",
      });
      assert.equal(logs.lines.join("\n").includes(secret), false);
    });
  } finally {
    logs.restore();
  }
});

test("album and asset caps reject the extra item without writing it", async () => {
  const assets = memoryAssets();
  const albums = memoryAlbums(assets);
  const { app } = createTestApp({ assets, albums, objects: fakeObjects() });
  await withServer(app, async (base) => {
    const owner = await registerSession(base, "caps@memora.test");
    for (let i = 0; i < MAX_ALBUMS_PER_USER; i += 1) {
      const created = await albums.createAlbum({
        id: `capalbum${i}`,
        userId: owner.user.id,
        title: `本${i}`,
        themeId: "cotton-candy",
      });
      assert.equal(created.ok, true);
    }
    const overflow = await postJson(base, "/api/v1/albums", { title: "多一本" }, owner.cookie);
    assert.equal(overflow.status, 409);
    assert.equal((overflow.body as { error: string }).error, "album_limit");

    const album = await albums.createAlbum({
      id: "fullalbum",
      userId: "someone-else",
      title: "别人的",
      themeId: "cotton-candy",
    });
    assert.equal(album.ok, true);
    const owned = await postJson(base, "/api/v1/albums", { title: "腾位置" }, owner.cookie);
    assert.equal(owned.status, 409);

    const room = memoryAlbums(assets);
    const app2 = createTestApp({ assets, albums: room, objects: fakeObjects() }).app;
    await withServer(app2, async (inner) => {
      const session = await registerSession(inner, "room@memora.test");
      const made = await postJson(inner, "/api/v1/albums", { title: "将满" }, session.cookie);
      const albumId = (made.body as { album: { albumId: string } }).album.albumId;
      const ids = Array.from({ length: MAX_ASSETS_PER_ALBUM }, (_, index) => `fullasset${index}`);
      for (const id of ids) {
        assets.rows.set(id, record({ id, userId: session.user.id, status: "ready" }));
      }
      const filled = await room.addAssets(albumId, session.user.id, ids);
      assert.equal(filled.ok, true);
      const extraId = randomUUID();
      assets.rows.set(extraId, record({ id: extraId, userId: session.user.id, status: "ready" }));
      const extra = await postJson(
        inner,
        `/api/v1/albums/${albumId}/assets`,
        { assetIds: [extraId] },
        session.cookie,
      );
      assert.equal(extra.status, 409);
      assert.equal((extra.body as { error: string }).error, "album_full");
      const detail = await getJson(inner, `/api/v1/albums/${albumId}`, session.cookie);
      const listed = (detail.body as { assets: { assetId: string }[] }).assets.map((item) => item.assetId);
      assert.equal(listed.includes(extraId), false);
      assert.equal(listed.length, MAX_ASSETS_PER_ALBUM);
    });
  });
});
