import { randomUUID } from "crypto";
import { hashPassword } from "../auth/password.js";
import { getRole, getTenantId } from "../context/authContext.js";
import {
  AppError,
  isForeignKeyViolation,
  isUniqueViolation,
} from "../errors/appError.js";
import {
  createUser as createUserRecord,
  deleteUser as deleteUserRecord,
  findUsers,
  findUserById,
  updateUser as updateUserRecord,
} from "../repositories/userRepository.js";
import {
  getCachedUser,
  getCachedUserList,
  invalidateTenantUsers,
  setCachedUser,
  setCachedUserList,
} from "../cache/userCache.js";
import type { Pagination } from "../schemas.js";
import type { CreateUserInput, Paginated, UpdateUserInput, User } from "../types.js";

export async function listUsers(
  pagination: Pagination
): Promise<Paginated<User>> {
  const tenantId = getTenantId();

  const cached = await getCachedUserList(tenantId, pagination);
  if (cached) {
    return cached;
  }

  const { rows, total } = await findUsers(pagination.limit, pagination.offset);
  const result: Paginated<User> = {
    data: rows,
    pagination: { limit: pagination.limit, offset: pagination.offset, total },
  };

  await setCachedUserList(tenantId, pagination, result);
  return result;
}

export async function getUser(id: string): Promise<User> {
  const tenantId = getTenantId();

  const cached = await getCachedUser(tenantId, id);
  if (cached) {
    return cached;
  }

  const user = await findUserById(id);

  if (!user) {
    throw new AppError(404, "User not found");
  }

  await setCachedUser(tenantId, id, user);
  return user;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const { name, email, password, role } = input;

  try {
    const passwordHash = await hashPassword(password);
    const user = await createUserRecord(
      randomUUID(),
      name,
      email,
      passwordHash,
      role
    );
    await invalidateTenantUsers(getTenantId());
    return user;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, "email already exists");
    }
    if (isForeignKeyViolation(err)) {
      throw new AppError(400, "tenant not found");
    }
    throw err;
  }
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  const { name, password, role } = input;

  // Only admins may change a user's role. This guards the role escalation path
  // at the domain layer, independent of route middleware.
  if (role !== undefined && getRole() !== "admin") {
    throw new AppError(403, "Only admins can change a user's role");
  }

  const passwordHash =
    password !== undefined ? await hashPassword(password) : null;

  const user = await updateUserRecord(id, name ?? null, passwordHash, role ?? null);

  if (!user) {
    throw new AppError(404, "User not found");
  }

  await invalidateTenantUsers(getTenantId());
  return user;
}

export async function deleteUser(id: string): Promise<void> {
  const deleted = await deleteUserRecord(id);

  if (!deleted) {
    throw new AppError(404, "User not found");
  }

  await invalidateTenantUsers(getTenantId());
}
