import {
  loadRuntimeConfig,
  runtimeWarnings,
  type RuntimeConfig,
} from "@memora/storage";

export interface AppConfig extends RuntimeConfig {
  port: number;
  sessionTtlSeconds: number;
  webOrigins: string[];
  cookieSecure: boolean;
  registrationOpen: boolean;
  /**
   * 为真时，新建分享必须带密码。默认否：密码可选，省略则沿用无密码分享。
   * 已存在的分享不受这个开关影响。
   */
  sharePasswordRequired: boolean;
  /** 为真时只说明环境里出现了 OIDC 变量。本阶段不读取 client secret，也不走授权码。 */
  oidcConfigured: boolean;
  /** 公开分享 GET 的固定窗口额度。和反代的公开前缀同一量级。 */
  shareReadLimit: number;
  /** 解锁 POST 的固定窗口额度。第 limit+1 次返回 429。 */
  shareUnlockLimit: number;
  shareRateWindowMs: number;
}

const DEFAULT_SHARE_READ_LIMIT = 60;
const DEFAULT_SHARE_UNLOCK_LIMIT = 6;
const DEFAULT_SHARE_RATE_WINDOW_SECONDS = 60;
const DEFAULT_SESSION_TTL_HOURS = 14 * 24;
const MAX_SESSION_TTL_HOURS = 90 * 24;
const DEFAULT_WEB_ORIGINS = "http://127.0.0.1:3000,http://localhost:3000";

function envFlag(raw: string | undefined): boolean | undefined {
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return undefined;
}

function sessionTtlSeconds(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "" || !/^\d+$/.test(raw.trim())) {
    return DEFAULT_SESSION_TTL_HOURS * 60 * 60;
  }
  const hours = Number(raw);
  if (!Number.isSafeInteger(hours) || hours < 1) {
    return DEFAULT_SESSION_TTL_HOURS * 60 * 60;
  }
  return Math.min(hours, MAX_SESSION_TTL_HOURS) * 60 * 60;
}

function webOrigins(raw: string | undefined): string[] {
  const source = raw === undefined || raw.trim() === "" ? DEFAULT_WEB_ORIGINS : raw;
  return source
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item !== "*");
}

function cookieSecure(
  env: NodeJS.ProcessEnv,
  deployMode: AppConfig["deployMode"],
  memoraEnv: AppConfig["memoraEnv"],
): boolean {
  const explicit = envFlag(env.COOKIE_SECURE);
  if (explicit !== undefined) return explicit;
  if (deployMode === "cloud") return true;
  if (memoraEnv === "prod" || memoraEnv === "staging") return true;
  return env.NODE_ENV === "production";
}

function sharePasswordRequired(raw: string | undefined): boolean {
  if (raw === undefined || raw.trim() === "") return false;
  const flag = envFlag(raw.trim());
  if (flag === undefined) {
    console.warn("[memora-api] SHARE_REQUIRE_PASSWORD 无效，回落可选密码");
    return false;
  }
  return flag;
}

function boundedInt(raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return fallback;
  const value = Number(raw.trim());
  if (!Number.isSafeInteger(value) || value < 1) return fallback;
  return Math.min(value, max);
}

function registrationOpen(raw: string | undefined): boolean {
  const value = (raw ?? "open").trim().toLowerCase();
  if (value === "open") return true;
  if (value === "closed") return false;
  console.warn(`[memora-api] AUTH_REGISTRATION=${raw} 无效，回落 open`);
  return true;
}

export function createConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const runtime = loadRuntimeConfig(env);
  const portRaw = Number(env.API_PORT ?? "3001");
  const issuer = env.OIDC_ISSUER?.trim() ?? "";
  const clientId = env.OIDC_CLIENT_ID?.trim() ?? "";
  const clientSecretSet = Boolean(env.OIDC_CLIENT_SECRET?.trim());
  return {
    ...runtime,
    port: Number.isFinite(portRaw) && portRaw > 0 ? Math.trunc(portRaw) : 3001,
    sessionTtlSeconds: sessionTtlSeconds(env.SESSION_TTL_HOURS),
    webOrigins: webOrigins(env.WEB_ORIGINS),
    cookieSecure: cookieSecure(env, runtime.deployMode, runtime.memoraEnv),
    registrationOpen: registrationOpen(env.AUTH_REGISTRATION),
    sharePasswordRequired: sharePasswordRequired(env.SHARE_REQUIRE_PASSWORD),
    oidcConfigured: Boolean(issuer || clientId || clientSecretSet),
    shareReadLimit: boundedInt(env.SHARE_READ_LIMIT, DEFAULT_SHARE_READ_LIMIT, 10_000),
    shareUnlockLimit: boundedInt(env.SHARE_UNLOCK_LIMIT, DEFAULT_SHARE_UNLOCK_LIMIT, 1_000),
    shareRateWindowMs:
      boundedInt(env.SHARE_RATE_WINDOW_SECONDS, DEFAULT_SHARE_RATE_WINDOW_SECONDS, 3_600) * 1_000,
  };
}

export const config = createConfig();

function authWarnings(current: AppConfig): string[] {
  const warnings: string[] = [];
  if (current.deployMode === "cloud" && !current.cookieSecure) {
    warnings.push("云模式关闭了会话 Cookie 的 Secure 标记");
  }
  if (current.oidcConfigured) {
    warnings.push("检测到 OIDC 环境变量，授权码流程尚未实现，登录仍只走邮箱密码");
  }
  return warnings;
}

export function logDeployWarnings(current: AppConfig = config): void {
  for (const warning of runtimeWarnings(current)) {
    console.warn(`[memora-api] ${warning}`);
  }
  for (const warning of authWarnings(current)) {
    console.warn(`[memora-api] ${warning}`);
  }
}
