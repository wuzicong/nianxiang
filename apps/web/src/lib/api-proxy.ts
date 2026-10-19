const RESPONSE_HEADER_NAMES = ["cache-control", "referrer-policy", "x-robots-tag", "retry-after"] as const;

/** 浏览器看到的分享 429 需要 Retry-After。会话 Cookie 由调用方另行转发。 */
export function applyProxyResponseHeaders(
  target: Headers,
  upstream: { get(name: string): string | null },
): void {
  const contentType = upstream.get("content-type");
  if (contentType) target.set("content-type", contentType);
  for (const name of RESPONSE_HEADER_NAMES) {
    const value = upstream.get(name);
    if (value) target.set(name, value);
  }
}
