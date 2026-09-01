import type { FastifyRequest } from "fastify";
export interface AuthPrincipal {
  userId: string;
  globalRole?: "SUPER_ADMIN";
  tenantId?: string;
  tenantRole?: "OWNER" | "ADMIN" | "STAFF";
}
export type CitariRequest = FastifyRequest & { principal?: AuthPrincipal };
