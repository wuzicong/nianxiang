const USERINFO = /:\/\/([^:/?#\s]*):([^@/?#\s]*)@/g;
const URL_QUERY = /\b((?:https?|redis|rediss):\/\/[^\s?]+)\?[^\s]*/gi;
const ACCESS_KEY = /\bA(KIA|SIA)[0-9A-Z]{16}\b/g;
const BEARER = /(authorization\s*[:=]\s*bearer\s+)(?!\*\*\*)\S+/gi;
const SESSION_COOKIE = /(memora_session=)(?!\*\*\*)[^;\s]+/gi;
const JSON_SECRET =
  /("(?:password|passwordHash|password_hash|token|session|authorization)"\s*:\s*")[^"]*/gi;
const ASSIGNED_SECRET =
  /((?:password|secret|token|authorization)\s*[=:]\s*)(?!\*\*\*|bearer\b)[^\s&]+/gi;
/** 分享页和公开读取路径上的能力令牌。先写更长的 API 路径，避免被短路径截断。 */
const SHARE_CAPABILITY =
  /(\/(?:api\/v1\/public\/shares|s)\/)(?!\*\*\*)[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g;

/** 日志用。去掉带密码的 URL、预签名 query、会话 Cookie 和常见密钥形状。 */
export function redactSecrets(input: string): string {
  return input
    .replace(USERINFO, "://$1:***@")
    .replace(URL_QUERY, "$1?***")
    .replace(ACCESS_KEY, "A$1***")
    .replace(BEARER, "$1***")
    .replace(SESSION_COOKIE, "$1***")
    .replace(JSON_SECRET, "$1***")
    .replace(ASSIGNED_SECRET, "$1***")
    .replace(SHARE_CAPABILITY, "$1***");
}

export function safeErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : "unknown_error";
  return redactSecrets(raw).slice(0, 500);
}
