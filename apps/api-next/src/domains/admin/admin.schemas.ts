import { z } from "zod";
export const tenantListSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25), status: z.enum(["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "ARCHIVED"]).optional(), search: z.string().trim().max(100).optional() });
export const createTenantSchema = z.object({ name: z.string().trim().min(2).max(200), slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100), timezone: z.string().trim().min(1).max(64), locale: z.string().trim().min(2).max(16).default("es-CR"), currency: z.string().trim().length(3).transform((v) => v.toUpperCase()).default("CRC") }).strict();
export const statusReasonSchema = z.object({ reason: z.string().trim().min(5).max(500) }).strict();
