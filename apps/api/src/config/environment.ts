import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  DATABASE_URL: z.url(),
  JWT_ISSUER: z.url(),
  JWT_AUDIENCE: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  MFA_ENCRYPTION_KEY: z.string().min(32),
  NOTIFICATION_ENCRYPTION_KEY: z.string().min(32),
  APP_PUBLIC_URL: z.url(),
  MAIL_TRANSPORT: z.enum(["smtp", "disabled"]).default("disabled"),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  MAIL_FROM: z.email().optional(),
  CORS_ORIGINS: z.string().default("http://localhost:3000")
}).superRefine((value, context) => {
  if (value.NODE_ENV === "production" && value.MAIL_TRANSPORT !== "smtp") {
    context.addIssue({ code: "custom", path: ["MAIL_TRANSPORT"], message: "SMTP delivery is required in production" });
  }
  if (value.MAIL_TRANSPORT === "smtp") {
    for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"] as const) {
      if (!value[key]) context.addIssue({ code: "custom", path: [key], message: `${key} is required for SMTP delivery` });
    }
  }
});

export type Environment = z.infer<typeof environmentSchema> & { corsOrigins: string[] };
export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  const parsed = environmentSchema.parse(input);
  return { ...parsed, corsOrigins: parsed.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean) };
}
export const ENVIRONMENT = Symbol("ENVIRONMENT");
