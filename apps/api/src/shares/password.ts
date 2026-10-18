import { hashPassword, verifyPassword } from "../auth/password.js";

let dummyHash: Promise<string> | null = null;

function dummySharePasswordHash(): Promise<string> {
  dummyHash ??= hashPassword("memora-share-dummy-password");
  return dummyHash;
}

/**
 * 分享不存在时也对哑哈希做一次 scrypt，避免用耗时区分「没有这个分享」和「密码不对」。
 * encoded 为空时结果一定是 false，即使用户碰巧输入了哑密码的原文。
 */
export async function sharePasswordMatches(
  password: string,
  encoded: string | null,
): Promise<boolean> {
  const candidate =
    password.length >= 1 && password.length <= 128 && !/[\u0000-\u001f\u007f]/.test(password)
      ? password
      : "\u0000";
  const hash = encoded ?? (await dummySharePasswordHash());
  const ok = await verifyPassword(candidate, hash);
  return encoded !== null && ok;
}
