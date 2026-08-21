export type UserRole = "owner" | "superadmin";

export type AuthUser = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  tenantId?: number | null;
};

export type LoginResponse = {
  accessToken: string;
  tokenType: string;
  user: AuthUser;
};
