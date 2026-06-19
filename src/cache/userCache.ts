import { cacheKey, getCached, invalidateResource, setCached } from "./cache.js";
import type { Pagination } from "../schemas.js";
import type { Paginated, User } from "../types.js";

const RESOURCE = "users";

export function getCachedUserList(
  tenantId: string,
  pagination: Pagination
): Promise<Paginated<User> | null> {
  return getCached<Paginated<User>>(
    cacheKey(tenantId, RESOURCE, {
      limit: pagination.limit,
      offset: pagination.offset,
    })
  );
}

export function setCachedUserList(
  tenantId: string,
  pagination: Pagination,
  users: Paginated<User>
): Promise<void> {
  return setCached(
    cacheKey(tenantId, RESOURCE, {
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    users
  );
}

export function getCachedUser(
  tenantId: string,
  id: string
): Promise<User | null> {
  return getCached<User>(cacheKey(tenantId, RESOURCE, { id }));
}

export function setCachedUser(
  tenantId: string,
  id: string,
  user: User
): Promise<void> {
  return setCached(cacheKey(tenantId, RESOURCE, { id }), user);
}

export function invalidateTenantUsers(tenantId: string): Promise<void> {
  return invalidateResource(tenantId, RESOURCE);
}
