import { AsyncLocalStorage } from "node:async_hooks";
import type { UserRole } from "../types.js";

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
