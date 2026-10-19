import assert from "node:assert/strict";
import test from "node:test";
import { startHealthServer, workerHealthPort } from "./health.js";

test("workerHealthPort falls back to 3002", () => {
  assert.equal(workerHealthPort(undefined), 3002);
  assert.equal(workerHealthPort(""), 3002);
  assert.equal(workerHealthPort("0"), 3002);
  assert.equal(workerHealthPort("65536"), 3002);
  assert.equal(workerHealthPort("3002"), 3002);
  assert.equal(workerHealthPort(" 4010 "), 4010);
});

test("health server answers GET /health and nothing else", async () => {
  const server = startHealthServer(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const ok = await fetch(`${base}/health`);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, service: "memora-worker" });
  const missing = await fetch(`${base}/other`, { method: "POST" });
  assert.equal(missing.status, 404);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
