import assert from "node:assert/strict";
import test from "node:test";
import {
  albumRefreshDelay,
  assetStatusLabel,
  parseAlbumAssets,
  previewUrl,
  PROCESSING_POLL_MS,
  PREVIEW_REFRESH_MS,
} from "../src/lib/album-assets";
import { imageMime, presignPutHeaders, readUploadGrant, uploadPhotoToAlbum } from "../src/lib/uploads";

const signedThumb =
  "http://127.0.0.1:9000/memora-local/users/owner/derivatives/asset1/thumb.webp?X-Amz-Signature=supersecret";

test("album assets keep derivative previews and drop original material", () => {
  const assets = parseAlbumAssets([
    {
      assetId: "asset1",
      filename: "harbor.jpg",
      status: "ready",
      key: "users/owner/originals/asset1",
      userId: "owner",
      derivatives: { thumb: "users/owner/derivatives/asset1/thumb.webp" },
      exif: { lat: 12.3456, lng: 99.9, hasGps: true },
      previews: {
        thumb: { url: signedThumb, expiresAt: "2026-01-01T00:10:00.000Z" },
        hero: { url: "javascript:alert(1)", expiresAt: "2026-01-01T00:10:00.000Z" },
        preview: {
          url: "http://127.0.0.1:9000/memora-local/users/owner/originals/asset1?X-Amz-Signature=supersecret",
          expiresAt: "2026-01-01T00:10:00.000Z",
        },
      },
    },
    {
      assetId: "asset2",
      filename: "queue.jpg",
      status: "processing",
      error: "http://127.0.0.1:9000/secret?X-Amz-Signature=supersecret",
      previews: {},
    },
    {
      assetId: "asset3",
      filename: "bad.jpg",
      status: "failed",
      error: "users/owner/originals/asset3 missing",
    },
    { filename: "skip.jpg" },
  ]);

  assert.equal(assets.length, 3);
  assert.equal(assets[0]?.filename, "harbor.jpg");
  assert.equal(previewUrl(assets[0]?.previews ?? {}), signedThumb);
  assert.equal(assets[0]?.previews.hero, undefined);
  assert.equal(assets[0]?.previews.preview, undefined);
  assert.equal(JSON.stringify(assets).includes("/originals/"), false);
  assert.equal(JSON.stringify(assets).includes("12.3456"), false);
  assert.equal(JSON.stringify(assets).includes("javascript:"), false);
  assert.equal(assets[1]?.error, null);
  assert.equal(assets[2]?.error, null);
  assert.equal(assetStatusLabel("failed"), "处理失败");
  assert.equal(assetStatusLabel("processing"), "正在生成预览");
  assert.equal(assetStatusLabel("uploaded"), "排队生成预览");
  assert.equal(albumRefreshDelay(assets.slice(0, 2)), PROCESSING_POLL_MS);
  assert.equal(albumRefreshDelay([assets[0]!]), PREVIEW_REFRESH_MS);
  assert.equal(albumRefreshDelay([]), null);
});

test("upload grant ignores storage keys and refuses non-http targets", () => {
  const grant = readUploadGrant({
    assetId: "asset1",
    key: "users/owner/originals/asset1",
    bucket: "memora-local",
    method: "PUT",
    url: "http://127.0.0.1:9000/memora-local/users/owner/originals/asset1?X-Amz-Signature=supersecret",
    headers: {
      "Content-Type": "image/png",
      "Content-Length": "8",
      Cookie: "memora_session=secret",
    },
  });
  assert.ok(grant);
  assert.equal("key" in grant, false);
  assert.deepEqual(presignPutHeaders(grant.headers), { "Content-Type": "image/png" });
  assert.equal(readUploadGrant({ assetId: "asset1", url: "javascript:alert(1)", headers: {} }), null);
  assert.equal(imageMime({ type: "", name: "pixel.PNG" }), "image/png");
  assert.equal(imageMime({ type: "image/gif", name: "noext" }), "image/gif");
  assert.equal(imageMime({ type: "text/plain", name: "notes.txt" }), null);
});

test("upload uses the presign flow and does not return or echo the signed url", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const png = new Blob([Uint8Array.from([1, 2, 3, 4])], { type: "image/png" });
  const signed = "http://127.0.0.1:9000/memora-local/users/owner/originals/asset1?X-Amz-Signature=supersecret";
  const phases: string[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url === "/api/v1/assets/upload-url") {
      return Response.json({
        assetId: "asset1",
        key: "users/owner/originals/asset1",
        url: signed,
        method: "PUT",
        headers: { "Content-Type": "image/png", "Content-Length": String(png.size), Cookie: "memora_session=secret" },
      }, { status: 201 });
    }
    if (url === signed) return new Response(null, { status: 200 });
    if (url === "/api/v1/assets/asset1/complete") {
      return Response.json({ assetId: "asset1", status: "uploaded" });
    }
    if (url === "/api/v1/albums/album-1/assets") {
      return Response.json({ albumId: "album-1", assetIds: ["asset1"] });
    }
    return Response.json({ message: "unexpected" }, { status: 500 });
  };

  const result = await uploadPhotoToAlbum(
    {
      albumId: "album-1",
      filename: "pixel.png",
      mime: "image/png",
      body: png,
      onPhase: (phase) => phases.push(phase),
    },
    { fetchImpl },
  );

  assert.deepEqual(result, { ok: true, assetId: "asset1" });
  assert.equal(JSON.stringify(result).includes("supersecret"), false);
  assert.deepEqual(phases, ["request", "put", "complete", "attach"]);
  assert.equal(calls[0]?.init?.credentials, "include");
  assert.equal(calls[1]?.url, signed);
  assert.equal(calls[1]?.init?.credentials, "omit");
  assert.equal(calls[1]?.init?.method, "PUT");
  const putHeaders = calls[1]?.init?.headers as Record<string, string>;
  assert.equal(putHeaders["Content-Type"], "image/png");
  assert.equal(putHeaders["Content-Length"], undefined);
  assert.equal(putHeaders.Cookie, undefined);
  assert.equal(calls[2]?.init?.credentials, "include");
  assert.equal(calls[3]?.init?.credentials, "include");
  assert.equal(calls[0]?.init?.body, JSON.stringify({ filename: "pixel.png", mime: "image/png", size: png.size }));
  assert.equal(String(calls[0]?.init?.body).includes("userId"), false);
  assert.equal(calls[2]?.init?.body, "{}");
  assert.deepEqual(JSON.parse(String(calls[3]?.init?.body)), { assetIds: ["asset1"] });
});

test("failed upload messages omit the presigned url", async () => {
  const signed = "http://127.0.0.1:9000/bucket/users/owner/originals/asset1?X-Amz-Signature=supersecret";
  const fetchImpl = async (url: string) => {
    if (url === "/api/v1/assets/upload-url") {
      return Response.json({
        assetId: "asset1",
        url: signed,
        method: "PUT",
        headers: { "Content-Type": "image/png" },
      }, { status: 201 });
    }
    if (url === signed) return new Response("signature was supersecret", { status: 403 });
    throw new Error(`unexpected ${url}`);
  };
  const result = await uploadPhotoToAlbum(
    {
      albumId: "album-1",
      filename: "pixel.png",
      mime: "",
      body: new Blob([Uint8Array.from([1])]),
    },
    { fetchImpl },
  );
  assert.deepEqual(result, { ok: false, message: "原图上传失败" });
  assert.equal(JSON.stringify(result).includes("supersecret"), false);

  const rejected = await uploadPhotoToAlbum(
    {
      albumId: "album-1",
      filename: "notes.txt",
      mime: "text/plain",
      body: new Blob([Uint8Array.from([1])]),
    },
    {
      fetchImpl: async () => {
        throw new Error("should not upload");
      },
    },
  );
  assert.deepEqual(rejected, { ok: false, message: "只接受 jpeg、png、webp、gif" });
});
