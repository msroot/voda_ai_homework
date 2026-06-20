import type { User } from "../types.js";

/** Public user shape returned by every user endpoint. */
export interface UserResponse {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: User["role"];
  created_at: string;
}

export function userToResponse(user: User): UserResponse {
  return {
    id: user.id,
    tenant_id: user.tenant_id,
    name: user.name,
    email: user.email,
    role: user.role,
    created_at: user.created_at.toISOString(),
  };
}
