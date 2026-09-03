import { z } from "zod";

export const slugSchema = z.string().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const availabilityQuerySchema = z.object({
  serviceId: z.uuid(), locationId: z.uuid(), from: z.coerce.date(), to: z.coerce.date()
}).refine((value) => value.from < value.to, "from must precede to").refine((value) => value.to.getTime() - value.from.getTime() <= 31 * 86_400_000, "Range cannot exceed 31 days");

export const slotHoldSchema = z.object({ serviceId: z.uuid(), locationId: z.uuid(), startAt: z.coerce.date() }).strict();

export const publicBookingSchema = z.object({
  serviceId: z.uuid(),
  locationId: z.uuid(),
  startAt: z.coerce.date(),
  holdToken: z.string().min(40).max(128),
  customer: z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(200),
    email: z.email().transform((value) => value.toLowerCase()),
    phone: z.string().trim().min(5).max(30).optional(),
    consent: z.literal(true),
    notes: z.string().trim().max(1000).optional()
  }),
  customerNotes: z.string().trim().max(1000).optional()
}).strict();

export const confirmationNonceSchema = z.object({ confirmationNonce: z.string().min(40).max(128) }).strict();
