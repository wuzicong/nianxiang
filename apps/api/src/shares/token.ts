import { createHash, randomBytes } from "node:crypto";
import { isShareToken } from "@memora/shared";

export function newShareToken(): string {
  const token = randomBytes(32).toString("base64url");
  if (!isShareToken(token)) throw new Error("share_token_shape");
  return token;
}

/** 只把哈希交给仓储。明文留在创建响应的内存里，不进日志参数。 */
export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
