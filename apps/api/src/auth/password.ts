import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

const KEY_LEN = 32;
const SCRYPT_OPTIONS: ScryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function scrypt(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, SCRYPT_OPTIONS, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

export function isAcceptablePassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= 8 && password.length <= 128;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1] ?? "", "base64url");
  const expected = Buffer.from(parts[2] ?? "", "base64url");
  if (salt.length < 8 || expected.length < 1) return false;
  const actual = await scrypt(password, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
