import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "memora_session";

/** 32 字节 base64url，无填充时固定 43 个字符。 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader || cookieHeader.length > 4096) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== SESSION_COOKIE_NAME) continue;
    const value = trimmed.slice(eq + 1);
    return TOKEN_PATTERN.test(value) ? value : null;
  }
  return null;
}

export function serializeSessionCookie(
  token: string,
  options: { secure: boolean; maxAgeSeconds: number },
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${options.maxAgeSeconds}`,
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function serializeClearedSessionCookie(options: { secure: boolean }): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}
