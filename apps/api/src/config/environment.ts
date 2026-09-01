import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z.url(),
  JWT_ISSUER: z.url(),
  JWT_AUDIENCE: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  MFA_ENCRYPTION_KEY: z.string().min(32),
  CORS_ORIGINS: z.string().default("http://localhost:3000")
});

export type Environment = z.infer<typeof environmentSchema> & { corsOrigins: string[] };
export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  const parsed = environmentSchema.parse(input);
  return { ...parsed, corsOrigins: parsed.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean) };
}
export const ENVIRONMENT = Symbol("ENVIRONMENT");
