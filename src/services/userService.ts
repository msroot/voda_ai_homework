import { randomUUID } from "crypto";
import { hashPassword } from "../auth/password.js";
import {
  AppError,
  isForeignKeyViolation,
  isUniqueViolation,
} from "../errors/appError.js";
import {
  createUser as createUserRecord,
  deleteUser as deleteUserRecord,
  findAllUsers,
  findUserById,
  updateUser as updateUserRecord,
} from "../repositories/userRepository.js";
import type { CreateUserInput, UpdateUserInput, User } from "../types.js";

export async function listUsers(): Promise<User[]> {
  return findAllUsers();
}

export async function getUser(id: string): Promise<User> {
  const user = await findUserById(id);

  if (!user) {
    throw new AppError(404, "User not found");
  }

  return user;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const { name, email, password, role } = input;

  try {
    const passwordHash = await hashPassword(password);
    return await createUserRecord(randomUUID(), name, email, passwordHash, role);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, "email already exists for this tenant");
    }
    if (isForeignKeyViolation(err)) {
      throw new AppError(400, "tenant not found");
    }
    throw err;
  }
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  const { name, email, password, role } = input;

  try {
    const passwordHash =
      password !== undefined ? await hashPassword(password) : null;

    const user = await updateUserRecord(
      id,
      name ?? null,
      email ?? null,
      passwordHash,
      role ?? null
    );

    if (!user) {
      throw new AppError(404, "User not found");
    }

    return user;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    if (isUniqueViolation(err)) {
      throw new AppError(409, "email already exists for this tenant");
    }
    throw err;
  }
}

export async function deleteUser(id: string): Promise<void> {
  const deleted = await deleteUserRecord(id);

  if (!deleted) {
    throw new AppError(404, "User not found");
  }
}
