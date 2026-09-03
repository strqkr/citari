import { z } from "zod";
import { isValidTimezone } from "../../scheduling/scheduling-integrity.service.js";

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const timezone = z.string().trim().min(1).max(64).refine(isValidTimezone, "Expected a valid IANA timezone").nullable().optional();
export const uuidSchema = z.uuid();
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  active: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  search: z.string().trim().max(100).optional(),
});

export const createCategorySchema = z.object({ name: trimmed(150), description: optionalText(500), isActive: z.boolean().optional(), sortOrder: z.number().int().min(0).max(1_000_000).optional() }).strict();
export const updateCategorySchema = createCategorySchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const createServiceSchema = z.object({
  categoryId: uuidSchema, name: trimmed(200), description: z.string().trim().max(5000).nullable().optional(),
  durationMinutes: z.number().int().min(5).max(1440), bufferBeforeMinutes: z.number().int().min(0).max(1440).optional(),
  bufferAfterMinutes: z.number().int().min(0).max(1440).optional(), price: z.number().nonnegative().max(9_999_999_999.99).nullable().optional(),
  minimumLeadMinutes: z.number().int().min(0).max(43_200).optional(), maximumAdvanceDays: z.number().int().min(1).max(730).optional(),
  cancellationNoticeMinutes: z.number().int().min(0).max(43_200).optional(), rescheduleNoticeMinutes: z.number().int().min(0).max(43_200).optional(),
  slotIntervalMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(60)]).optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()), showPrice: z.boolean().optional(), isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
}).strict();
export const updateServiceSchema = createServiceSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const createLocationSchema = z.object({
  name: trimmed(200), timezone, addressLine1: optionalText(200), addressLine2: optionalText(200), province: optionalText(100),
  canton: optionalText(100), district: optionalText(100), postalCode: optionalText(20), isMain: z.boolean().optional(), isActive: z.boolean().optional(),
}).strict();
export const updateLocationSchema = createLocationSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm in 24-hour format");
export const businessHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6), isClosed: z.boolean().default(false), openTime: time.nullable().optional(), closeTime: time.nullable().optional(),
}).strict().superRefine((value, context) => {
  if (!value.isClosed && (!value.openTime || !value.closeTime)) context.addIssue({ code: "custom", message: "Open and close time are required when open" });
  if (!value.isClosed && value.openTime && value.closeTime && value.openTime >= value.closeTime) context.addIssue({ code: "custom", message: "Close time must be after open time" });
});
export const replaceBusinessHoursSchema = z.object({ hours: z.array(businessHourSchema).max(7).refine((hours) => new Set(hours.map(({ dayOfWeek }) => dayOfWeek)).size === hours.length, "Each weekday may appear only once") }).strict();

export type Pagination = z.infer<typeof paginationSchema>;
export type CreateCategory = z.infer<typeof createCategorySchema>;
export type UpdateCategory = z.infer<typeof updateCategorySchema>;
export type CreateService = z.infer<typeof createServiceSchema>;
export type UpdateService = z.infer<typeof updateServiceSchema>;
export type CreateLocation = z.infer<typeof createLocationSchema>;
export type UpdateLocation = z.infer<typeof updateLocationSchema>;
export type ReplaceBusinessHours = z.infer<typeof replaceBusinessHoursSchema>;
