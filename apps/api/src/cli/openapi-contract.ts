import "reflect-metadata";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApplication } from "../bootstrap.js";
import { buildOpenApiDocument, OPENAPI_VERSION } from "../openapi.js";

const contractEnvironment = {
  DATABASE_URL: "postgresql://contract:contract@127.0.0.1:5432/contract?schema=public",
  JWT_ISSUER: "https://contract.citari.test",
  JWT_AUDIENCE: "citari-contract",
  JWT_SECRET: "contract-jwt-secret-with-at-least-32-bytes",
  MFA_ENCRYPTION_KEY: "contract-mfa-secret-with-at-least-32-bytes",
  NOTIFICATION_ENCRYPTION_KEY: "contract-notification-secret-32-bytes",
  APP_PUBLIC_URL: "https://contract.citari.test"
} as const;

for (const [name, value] of Object.entries(contractEnvironment)) process.env[name] ??= value;

const output = resolve("openapi", `citari.v${OPENAPI_VERSION.split(".")[0]}.json`);
const check = process.argv.includes("--check");
const app = await createApplication({ initialize: false });

try {
  const document = buildOpenApiDocument(app);
  if (!document.openapi.startsWith("3.") || Object.keys(document.paths).some((path) => !path.startsWith("/api/v1/"))) {
    throw new Error("Generated OpenAPI contract has an unexpected version or unversioned path");
  }
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  if (check) {
    const committed = await readFile(output, "utf8");
    if (committed !== serialized) throw new Error("Committed OpenAPI contract is stale. Run pnpm openapi:generate and review the contract diff.");
  } else {
    await mkdir(resolve("openapi"), { recursive: true });
    await writeFile(output, serialized, "utf8");
  }
} finally {
  await app.close();
}
