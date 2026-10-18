import { randomUUID } from "node:crypto";
import { isSafeStorageId } from "@memora/shared";
import { EmailTakenError, type AuthRepository } from "@memora/storage";
import { HttpError } from "../http.js";
import { hashSessionToken, newSessionToken, readSessionToken } from "./cookies.js";
import { hashPassword, isAcceptablePassword, verifyPassword } from "./password.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PublicUser {
  id: string;
  email: string;
}

export interface IssuedSession {
  token: string;
  user: PublicUser;
  expiresAt: Date;
}

export interface AuthAttempt {
  email: unknown;
  password: unknown;
}

let dummyHash: Promise<string> | null = null;

function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword("memora-dummy-password");
  return dummyHash;
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  if (!EMAIL.test(email)) return null;
  return email;
}

async function issueSession(
  auth: AuthRepository,
  user: PublicUser,
  sessionTtlSeconds: number,
): Promise<IssuedSession> {
  if (!isSafeStorageId(user.id)) {
    throw new HttpError(500, "internal_error", "内部错误");
  }
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + sessionTtlSeconds * 1000);
  await auth.insertSession({
    tokenHash: hashSessionToken(token),
    userId: user.id,
    expiresAt,
  });
  return { token, user, expiresAt };
}

export async function registerUser(
  auth: AuthRepository,
  input: AuthAttempt,
  options: { registrationOpen: boolean; sessionTtlSeconds: number },
): Promise<IssuedSession> {
  if (!options.registrationOpen) {
    throw new HttpError(403, "registration_closed", "当前不开放注册");
  }
  const email = normalizeEmail(input.email);
  if (!email) throw new HttpError(400, "invalid_email", "邮箱格式不正确");
  if (typeof input.password !== "string") {
    throw new HttpError(400, "invalid_request", "邮箱和密码必填");
  }
  if (!isAcceptablePassword(input.password)) {
    throw new HttpError(400, "weak_password", "密码需要 8 到 128 个字符");
  }
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await auth.insertUser({
      id: randomUUID(),
      email,
      passwordHash,
    });
    return await issueSession(auth, { id: user.id, email: user.email }, options.sessionTtlSeconds);
  } catch (err) {
    if (err instanceof EmailTakenError) {
      throw new HttpError(409, "email_taken", "该邮箱已注册");
    }
    throw err;
  }
}

export async function loginUser(
  auth: AuthRepository,
  input: AuthAttempt,
  options: { sessionTtlSeconds: number },
): Promise<IssuedSession> {
  if (typeof input.password !== "string" || typeof input.email !== "string") {
    throw new HttpError(400, "invalid_request", "邮箱和密码必填");
  }
  const email = normalizeEmail(input.email);
  if (!email || input.password.length < 1 || input.password.length > 128) {
    throw new HttpError(401, "invalid_credentials", "邮箱或密码不正确");
  }
  const user = await auth.findUserByEmail(email);
  const ok = await verifyPassword(input.password, user?.passwordHash ?? (await dummyPasswordHash()));
  if (!user || !ok) {
    throw new HttpError(401, "invalid_credentials", "邮箱或密码不正确");
  }
  return issueSession(auth, { id: user.id, email: user.email }, options.sessionTtlSeconds);
}

export async function resolveSession(
  auth: AuthRepository,
  cookieHeader: string | undefined,
): Promise<PublicUser | null> {
  const token = readSessionToken(cookieHeader);
  if (!token) return null;
  const session = await auth.findActiveSession(hashSessionToken(token));
  if (!session) return null;
  if (!isSafeStorageId(session.userId)) return null;
  return { id: session.userId, email: session.email };
}

export async function revokePresentedSession(
  auth: AuthRepository,
  cookieHeader: string | undefined,
): Promise<void> {
  const token = readSessionToken(cookieHeader);
  if (!token) return;
  await auth.revokeSession(hashSessionToken(token));
}
