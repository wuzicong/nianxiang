import pg from "pg";
import { safeErrorMessage } from "./redact.js";
import { AUTH_SCHEMA_SQL, SCHEMA_ADVISORY_LOCK } from "./schema.js";

const { Pool } = pg;

export class EmailTakenError extends Error {
  constructor() {
    super("email_taken");
    this.name = "EmailTakenError";
  }
}

export interface AuthUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface AuthSession {
  userId: string;
  email: string;
  expiresAt: string;
}

export interface NewAuthUser {
  id: string;
  email: string;
  passwordHash: string;
}

export interface NewAuthSession {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}

export interface AuthRepository {
  ready(): Promise<void>;
  insertUser(user: NewAuthUser): Promise<AuthUser>;
  findUserByEmail(email: string): Promise<AuthUser | null>;
  insertSession(session: NewAuthSession): Promise<void>;
  findActiveSession(tokenHash: string): Promise<AuthSession | null>;
  revokeSession(tokenHash: string): Promise<void>;
  close(): Promise<void>;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date | string;
}

interface SessionRow {
  user_id: string;
  email: string;
  expires_at: Date | string;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: iso(row.created_at),
  };
}

function sslFor(connectionString: string): pg.ConnectionConfig["ssl"] {
  if (/localhost|127\.0\.0\.1/.test(connectionString)) return undefined;
  if (/sslmode=disable/i.test(connectionString)) return undefined;
  if (/sslmode=verify-full/i.test(connectionString)) {
    return { rejectUnauthorized: true };
  }
  if (/sslmode=(require|verify-ca|prefer)/i.test(connectionString)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

function isEmailUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr.code === "23505" && pgErr.constraint === "users_email_unique";
}

export function createAuthRepository(options: {
  connectionString: string;
  applicationName?: string;
}): AuthRepository {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    application_name: options.applicationName ?? "memora",
    ssl: sslFor(options.connectionString),
  });
  pool.on("error", (err) => {
    console.error("[memora-storage] postgres pool error", safeErrorMessage(err));
  });

  let readyPromise: Promise<void> | null = null;

  async function migrate(): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock($1::bigint)", [SCHEMA_ADVISORY_LOCK]);
      await client.query(AUTH_SCHEMA_SQL);
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [SCHEMA_ADVISORY_LOCK]);
      } catch (err) {
        console.error("[memora-storage] schema unlock failed", safeErrorMessage(err));
      }
      client.release();
    }
  }

  function ready(): Promise<void> {
    if (!readyPromise) {
      readyPromise = migrate().catch((err) => {
        readyPromise = null;
        throw err;
      });
    }
    return readyPromise;
  }

  async function query<T extends pg.QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<pg.QueryResult<T>> {
    await ready();
    return pool.query<T>(text, values);
  }

  return {
    ready,
    async insertUser(user) {
      try {
        const result = await query<UserRow>(
          `INSERT INTO users (id, email, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id, email, password_hash, created_at`,
          [user.id, user.email, user.passwordHash],
        );
        const row = result.rows[0];
        if (!row) throw new Error("insert_user_failed");
        return mapUser(row);
      } catch (err) {
        if (isEmailUniqueViolation(err)) throw new EmailTakenError();
        throw err;
      }
    },
    async findUserByEmail(email) {
      const result = await query<UserRow>(
        `SELECT id, email, password_hash, created_at FROM users WHERE email = $1`,
        [email],
      );
      const row = result.rows[0];
      return row ? mapUser(row) : null;
    },
    async insertSession(session) {
      await query(
        `INSERT INTO sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, $3)`,
        [session.tokenHash, session.userId, session.expiresAt],
      );
    },
    async findActiveSession(tokenHash) {
      const result = await query<SessionRow>(
        `SELECT s.user_id, u.email, s.expires_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1
           AND s.revoked_at IS NULL
           AND s.expires_at > now()`,
        [tokenHash],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        userId: row.user_id,
        email: row.email,
        expiresAt: iso(row.expires_at),
      };
    },
    async revokeSession(tokenHash) {
      await query(
        `UPDATE sessions
         SET revoked_at = now()
         WHERE token_hash = $1 AND revoked_at IS NULL`,
        [tokenHash],
      );
    },
    async close() {
      await pool.end();
    },
  };
}
