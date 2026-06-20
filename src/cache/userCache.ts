import { cacheKey, getCached, invalidateResource, setCached } from "./cache.js";
import type { UserResponse } from "../api/userResponse.js";
import type { Pagination } from "../schemas.js";
import type { Paginated } from "../types.js";

const RESOURCE = "users";

export function getCachedUserList(
  tenantId: string,
  pagination: Pagination
): Promise<Paginated<UserResponse> | null> {
  return getCached<Paginated<UserResponse>>(
    cacheKey(tenantId, RESOURCE, {
      limit: pagination.limit,
      offset: pagination.offset,
    })
  );
}

export function setCachedUserList(
  tenantId: string,
  pagination: Pagination,
  users: Paginated<UserResponse>
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
): Promise<UserResponse | null> {
  return getCached<UserResponse>(cacheKey(tenantId, RESOURCE, { id }));
}

export function setCachedUser(
  tenantId: string,
  id: string,
  user: UserResponse
): Promise<void> {
  return setCached(cacheKey(tenantId, RESOURCE, { id }), user);
}

export function invalidateTenantUsers(tenantId: string): Promise<void> {
  return invalidateResource(tenantId, RESOURCE);
}
