import { signToken } from "../auth/jwt.js";
import { verifyPassword } from "../auth/password.js";
import { AppError } from "../errors/appError.js";
import { findUserByEmail } from "../repositories/userRepository.js";
import type { LoginInput, User } from "../types.js";

export interface LoginResult {
  token: string;
  user: User;
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const found = await findUserByEmail(input.email);

  if (!found || !(await verifyPassword(input.password, found.password_hash))) {
    throw new AppError(401, "Invalid credentials");
  }

  const { password_hash, ...user } = found;

  const token = signToken({
    sub: user.id,
    tenant_id: user.tenant_id,
    email: user.email,
    role: user.role,
  });

  return { token, user };
}
