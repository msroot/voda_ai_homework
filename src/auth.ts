import { AsyncLocalStorage } from "node:async_hooks";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { UserRole } from "./types.js";

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ?? "24h") as SignOptions["expiresIn"];

interface AuthContext {
  userId: string;
  tenantId: string;
  role: UserRole;
}

const authStorage = new AsyncLocalStorage<AuthContext>();

export function runWithAuthContext<T>(context: AuthContext, fn: () => T): T {
  return authStorage.run(context, fn);
}

export function tryGetTenantId(): string | undefined {
  return authStorage.getStore()?.tenantId;
}

export function tryGetUserId(): string | undefined {
  return authStorage.getStore()?.userId;
}

function getRequired<K extends keyof AuthContext>(key: K): AuthContext[K] {
  const value = authStorage.getStore()?.[key];

  if (value === undefined) {
    throw new Error("Auth context not available");
  }

  return value;
}

export function getTenantId(): string {
  return getRequired("tenantId");
}

export function getUserId(): string {
  return getRequired("userId");
}

export function getRole(): UserRole {
  return getRequired("role");
}

interface AuthTokenPayload {
  sub: string;
  tenant_id: string;
  email: string;
  role: UserRole;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
