import { signToken } from "../lib/jwt.js";
import { verifyPassword } from "../lib/password.js";
import { userToResponse, type LoginResponse } from "../lib/responses.js";
import { AppError } from "../lib/appError.js";
import type { LoginInput } from "../schemas.js";
import { findUserByEmail } from "../repositories/userRepository.js";

export async function login(input: LoginInput): Promise<LoginResponse> {
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
