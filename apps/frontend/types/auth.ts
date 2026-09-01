export type AuthUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  globalRole?: "SUPER_ADMIN" | null;
  tenantRole?: "OWNER" | "ADMIN" | "STAFF";
  tenantId?: string | null;
};
