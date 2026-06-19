import { AsyncLocalStorage } from "node:async_hooks";
import type { UserRole } from "../types.js";

export interface AuthContext {
  userId: string;
  tenantId: string;
  email: string;
  role: UserRole;
}

const authStorage = new AsyncLocalStorage<AuthContext>();

export function runWithAuthContext<T>(context: AuthContext, fn: () => T): T {
  return authStorage.run(context, fn);
}

function getAuthContext(): AuthContext {
  const context = authStorage.getStore();

  if (!context) {
    throw new Error("Auth context not available");
  }

  return context;
}

export function getTenantId(): string {
  return getAuthContext().tenantId;
}

export function getUserId(): string {
  return getAuthContext().userId;
}
