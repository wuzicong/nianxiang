const USERINFO = /:\/\/([^:/?#\s]*):([^@/?#\s]*)@/g;
const URL_QUERY = /\b((?:https?|redis|rediss):\/\/[^\s?]+)\?[^\s]*/gi;
const ACCESS_KEY = /\bA(KIA|SIA)[0-9A-Z]{16}\b/g;
const ASSIGNED_SECRET =
  /((?:password|secret|token|authorization)\s*[=:]\s*)(?!\*\*\*)[^\s&]+/gi;

/** 日志用。去掉带密码的 URL、预签名 query 和常见密钥形状。 */
export function redactSecrets(input: string): string {
  return input
    .replace(USERINFO, "://$1:***@")
    .replace(URL_QUERY, "$1?***")
    .replace(ACCESS_KEY, "A$1***")
    .replace(ASSIGNED_SECRET, "$1***");
}

export function safeErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : "unknown_error";
  return redactSecrets(raw).slice(0, 500);
}
