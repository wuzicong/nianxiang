import assert from "node:assert/strict";
import test from "node:test";
import { createConfig } from "./config.js";
import { ENV } from "./test-app.js";

test("local selfhost leaves the session cookie insecure and registration open", () => {
  const config = createConfig(ENV);
  assert.equal(config.cookieSecure, false);
  assert.equal(config.registrationOpen, true);
  assert.equal(config.sessionTtlSeconds, 14 * 24 * 60 * 60);
  assert.equal(config.oidcConfigured, false);
  assert.equal(config.sharePasswordRequired, false);
  assert.deepEqual(config.webOrigins, ["http://127.0.0.1:3000", "http://localhost:3000"]);
});

test("cloud, staging, and production force Secure unless explicitly disabled", () => {
  assert.equal(createConfig({ ...ENV, DEPLOY_MODE: "cloud" }).cookieSecure, true);
  assert.equal(
    createConfig({ ...ENV, MEMORA_ENV: "prod", S3_BUCKET: "memora-prod" }).cookieSecure,
    true,
  );
  assert.equal(
    createConfig({ ...ENV, MEMORA_ENV: "staging", S3_BUCKET: "memora-staging" }).cookieSecure,
    true,
  );
  assert.equal(createConfig({ ...ENV, NODE_ENV: "production" }).cookieSecure, true);
  assert.equal(
    createConfig({ ...ENV, DEPLOY_MODE: "cloud", COOKIE_SECURE: "false" }).cookieSecure,
    false,
  );
});

test("session, registration, and oidc flags do not retain the client secret", () => {
  assert.equal(createConfig({ ...ENV, SESSION_TTL_HOURS: "2" }).sessionTtlSeconds, 7200);
  assert.equal(
    createConfig({ ...ENV, SESSION_TTL_HOURS: "nope" }).sessionTtlSeconds,
    14 * 24 * 60 * 60,
  );
  assert.equal(createConfig({ ...ENV, AUTH_REGISTRATION: "closed" }).registrationOpen, false);
  const secret = "oidc-client-secret-value";
  const config = createConfig({
    ...ENV,
    OIDC_ISSUER: "https://idp.example",
    OIDC_CLIENT_SECRET: secret,
    WEB_ORIGINS: "https://app.example, *",
  });
  assert.equal(config.oidcConfigured, true);
  assert.deepEqual(config.webOrigins, ["https://app.example"]);
  assert.equal(JSON.stringify(config).includes(secret), false);
  assert.equal(createConfig({ ...ENV, SHARE_REQUIRE_PASSWORD: "true" }).sharePasswordRequired, true);
  assert.equal(createConfig({ ...ENV, SHARE_REQUIRE_PASSWORD: "0" }).sharePasswordRequired, false);
  assert.equal(createConfig({ ...ENV, SHARE_REQUIRE_PASSWORD: "yes" }).sharePasswordRequired, false);
});
