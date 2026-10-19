import assert from "node:assert/strict";
import test from "node:test";
import { runUploadPool } from "../src/lib/run-upload-pool";
import { uploadHints, validateUploadFile } from "../src/lib/upload-policy";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

test("upload hints match default API size limit", () => {
  assert.match(uploadHints(DEFAULT_MAX_BYTES), /25 MB/);
  assert.match(uploadHints(DEFAULT_MAX_BYTES), /JPEG/);
});

test("validateUploadFile rejects oversize and unknown types", () => {
  const big = new File([new Uint8Array(DEFAULT_MAX_BYTES + 1)], "big.jpg", {
    type: "image/jpeg",
  });
  assert.match(validateUploadFile(big, DEFAULT_MAX_BYTES)!, /超过/);

  const text = new File([new Uint8Array([1])], "notes.txt", { type: "text/plain" });
  assert.match(validateUploadFile(text, DEFAULT_MAX_BYTES)!, /格式不支持/);
});

test("runUploadPool respects concurrency", async () => {
  const order: number[] = [];
  let active = 0;
  let peak = 0;
  const items = [0, 1, 2, 3];
  await runUploadPool(items, 2, async (item) => {
    active += 1;
    peak = Math.max(peak, active);
    order.push(item);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
  });
  assert.equal(peak, 2);
  assert.equal(order.length, 4);
});
