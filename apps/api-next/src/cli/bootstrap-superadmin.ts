import { createHash } from "node:crypto";
import argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const EXPECTED_EMAIL = "andrew@euxora.net";

async function readPassword(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error("Pipe the initial password through stdin; interactive echo is intentionally disabled.");
  }
  process.stdin.setEncoding("utf8");
  let value = "";
  for await (const chunk of process.stdin) value += chunk;
  return value.trimEnd();
}

function validatePassword(password: string): void {
  if (password.length < 16 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    throw new Error("Initial password must be at least 16 characters with upper, lower, and numeric characters.");
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.BOOTSTRAP_DATABASE_URL;
  if (!databaseUrl) throw new Error("BOOTSTRAP_DATABASE_URL with BYPASSRLS is required");

  const password = await readPassword();
  validatePassword(password);
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email: EXPECTED_EMAIL } });
      if (existing && existing.globalRole !== "SUPER_ADMIN") {
        throw new Error("The bootstrap email already belongs to a non-superadmin user.");
      }

      const user = await tx.user.upsert({
        where: { email: EXPECTED_EMAIL },
        create: {
          email: EXPECTED_EMAIL,
          firstName: "Andrew",
          lastName: "Fuentes",
          passwordHash,
          emailVerifiedAt: new Date(),
          passwordChangeRequired: true,
          mfaRequired: true,
          globalRole: "SUPER_ADMIN",
        },
        update: {},
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          action: existing ? "SUPERADMIN_BOOTSTRAP_SKIPPED" : "SUPERADMIN_BOOTSTRAPPED",
          entityType: "User",
          entityId: user.id,
          metadata: { emailHash: createHash("sha256").update(EXPECTED_EMAIL).digest("hex") },
        },
      });
    });
    process.stdout.write("Superadmin bootstrap completed. MFA and password change are required.\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown bootstrap failure";
  process.stderr.write(`Bootstrap failed: ${message}\n`);
  process.exitCode = 1;
});
