import { SignJWT, jwtVerify } from "jose";
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "./db";
import { verifyPassword } from "./password";
import {
  AppError,
  isDatabaseConnectionError,
  DatabaseUnavailableError,
  UnauthenticatedError,
} from "./errors";
import type { SessionUser } from "@/types";

/**
 * Session handling: signed JWT in an HttpOnly, SameSite=Lax cookie (spec §17).
 * DB credentials and AUTH_SECRET are server-only.
 */

const SESSION_COOKIE = "hi_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a random value (>= 32 chars) in .env.local."
    );
  }
  return new TextEncoder().encode(secret);
}

async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    username: user.username,
    displayName: user.displayName,
  })
    .setSubject(String(user.id))
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

function cookieFlags(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export async function sessionSetCookie(user: SessionUser): Promise<string> {
  const token = await createSessionToken(user);
  return `${SESSION_COOKIE}=${token}; ${cookieFlags()}`;
}

export function sessionClearCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

function readNamedCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/** Read and verify the session, or null when unauthenticated. */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const token = readNamedCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    const id = Number(payload.sub);
    if (!Number.isInteger(id) || id <= 0) return null;
    return {
      id,
      username: typeof payload.username === "string" ? payload.username : "",
      displayName:
        typeof payload.displayName === "string" ? payload.displayName : "",
    };
  } catch {
    return null;
  }
}

/** For API routes: throws 401 when there is no valid session. */
export async function requireUser(request: Request): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) throw new UnauthenticatedError();
  return user;
}

// ---------------------------------------------------------------------------
// Login throttling (basic, in-memory — one local machine, small threat model).
// ---------------------------------------------------------------------------

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 8;
const attemptsByKey = new Map<string, { count: number; resetAt: number }>();

function rateLimitKey(username: string, ip: string): string {
  return `${username.toLowerCase()}|${ip}`;
}

export function assertLoginAllowed(username: string, ip: string): void {
  const key = rateLimitKey(username, ip);
  const entry = attemptsByKey.get(key);
  if (!entry) return;
  if (Date.now() > entry.resetAt) {
    attemptsByKey.delete(key);
    return;
  }
  if (entry.count >= MAX_ATTEMPTS) {
    throw new AppError(
      "CONFLICT",
      429,
      "Too many failed login attempts. Wait a few minutes and try again."
    );
  }
}

export function recordFailedLogin(username: string, ip: string): void {
  const key = rateLimitKey(username, ip);
  const entry = attemptsByKey.get(key);
  if (!entry || Date.now() > entry.resetAt) {
    attemptsByKey.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.count += 1;
  }
  if (attemptsByKey.size > 1000) {
    const now = Date.now();
    for (const [k, v] of attemptsByKey) {
      if (now > v.resetAt) attemptsByKey.delete(k);
    }
  }
}

export function clearFailedLogins(username: string, ip: string): void {
  attemptsByKey.delete(rateLimitKey(username, ip));
}

// ---------------------------------------------------------------------------
// Credential check
// ---------------------------------------------------------------------------

interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  is_active: number;
}

/**
 * Verify username/password. Returns the user on success, null otherwise.
 * Deliberately does not reveal whether the username exists (spec §17).
 */
export async function verifyCredentials(
  username: string,
  password: string
): Promise<SessionUser | null> {
  let rows: UserRow[];
  try {
    const [result] = await pool.query<UserRow[]>(
      "SELECT id, username, password_hash, display_name, is_active FROM users WHERE username = ? LIMIT 1",
      [username]
    );
    rows = result;
  } catch (error) {
    if (isDatabaseConnectionError(error)) throw new DatabaseUnavailableError(error);
    throw error;
  }

  const row = rows[0];
  if (!row) {
    await verifyPassword(
      password,
      "$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpWtOPsQK1RMIrZlaB0qCPHkXhNSa"
    );
    return null;
  }
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok || row.is_active !== 1) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
  };
}
