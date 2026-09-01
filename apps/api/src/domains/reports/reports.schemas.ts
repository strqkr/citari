import { z } from "zod";
export const rangeSchema=z.object({from:z.coerce.date(),to:z.coerce.date(),page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25)}).refine(v=>v.from<=v.to,"from must precede to").refine(v=>v.to.getTime()-v.from.getTime()<=366*86400000,"Range cannot exceed 366 days");
