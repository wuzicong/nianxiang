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
  /** 为真时只说明环境里出现了 OIDC 变量。本阶段不读取 client secret，也不走授权码。 */
  oidcConfigured: boolean;
}

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
    oidcConfigured: Boolean(issuer || clientId || clientSecretSet),
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
