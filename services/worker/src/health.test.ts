import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { startWorkerHealthServer, workerHealthHost } from "./health.js";

function address(server: ReturnType<typeof startWorkerHealthServer>): AddressInfo {
  const value = server.address();
  if (!value || typeof value === "string") throw new Error("health server has no port");
  return value;
}

test("worker health host never binds all interfaces", () => {
  assert.equal(workerHealthHost(undefined), "127.0.0.1");
  assert.equal(workerHealthHost("  "), "127.0.0.1");
  assert.equal(workerHealthHost("0.0.0.0"), "127.0.0.1");
  assert.equal(workerHealthHost("::"), "127.0.0.1");
  assert.equal(workerHealthHost("127.0.0.1"), "127.0.0.1");
});

test("worker health responds on loopback only", async () => {
  const server = startWorkerHealthServer({ port: 0, host: "0.0.0.0" });
  try {
    await once(server, "listening");
    const info = address(server);
    assert.equal(info.address, "127.0.0.1");
    const healthy = await fetch(`http://127.0.0.1:${info.port}/health`);
    assert.equal(healthy.status, 200);
    assert.equal(healthy.headers.get("cache-control"), "no-store");
    assert.deepEqual(await healthy.json(), { ok: true, service: "memora-worker" });
    const missing = await fetch(`http://127.0.0.1:${info.port}/other`);
    assert.equal(missing.status, 404);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("worker health is 503 when the probe fails", async () => {
  const server = startWorkerHealthServer({
    port: 0,
    probe: async () => false,
  });
  try {
    await once(server, "listening");
    const info = address(server);
    const response = await fetch(`http://127.0.0.1:${info.port}/health`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, service: "memora-worker" });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
