import { z } from "zod";
const optionalContact = (max: number) => z.string().trim().min(1).max(max).nullable().optional();
export const customerQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25), search: z.string().trim().max(100).optional() });
const customerFieldsSchema = z.object({
  firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(200), email: optionalContact(254).refine((value) => !value || z.email().safeParse(value).success, "Invalid email"),
  phone: optionalContact(30), notes: z.string().trim().max(1000).nullable().optional(), consent: z.boolean().optional(),
}).strict();
export const createCustomerSchema = customerFieldsSchema.refine((value) => Boolean(value.email ?? value.phone), { message: "Email or phone is required" });
export const updateCustomerSchema = customerFieldsSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");
export type CustomerQuery = z.infer<typeof customerQuerySchema>;
export type CreateCustomer = z.infer<typeof createCustomerSchema>;
export type UpdateCustomer = z.infer<typeof updateCustomerSchema>;
