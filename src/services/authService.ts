import { signToken, verifyPassword } from "../auth.js";
import { userToResponse, type UserResponse } from "../responses.js";
import { AppError } from "../appError.js";
import { findUserByEmail } from "../repositories/userRepository.js";
import type { LoginInput } from "../types.js";

interface LoginResult {
  token: string;
  user: UserResponse;
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const found = await findUserByEmail(input.email);

  if (!found || !(await verifyPassword(input.password, found.password_hash))) {
    throw new AppError(401, "Invalid credentials");
  }

  const { password_hash, ...user } = found;
  void password_hash;

  const token = signToken({
    sub: user.id,
    tenant_id: user.tenant_id,
    email: user.email,
    role: user.role,
  });

  return { token, user: userToResponse(user) };
}
