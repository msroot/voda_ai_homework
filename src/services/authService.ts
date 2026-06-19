import { signToken } from "../auth/jwt.js";
import { verifyPassword } from "../auth/password.js";
import { AppError } from "../errors/appError.js";
import { findUserByEmail } from "../repositories/userRepository.js";
import type { LoginInput, User, UserRole } from "../types.js";

export interface LoginResult {
  token: string;
  user: User;
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const { email, password } = input;

  const user = await findUserByEmail(email);

  if (!user) {
    throw new AppError(401, "Invalid credentials");
  }

  const validPassword = await verifyPassword(password, user.password_hash);

  if (!validPassword) {
    throw new AppError(401, "Invalid credentials");
  }

  const token = signToken({
    sub: user.id,
    tenant_id: user.tenant_id,
    email: user.email,
    role: user.role as UserRole,
  });

  return {
    token,
    user: {
      id: user.id,
      tenant_id: user.tenant_id,
      name: user.name,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
    },
  };
}
