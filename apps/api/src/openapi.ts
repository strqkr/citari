import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import type { INestApplication } from "@nestjs/common";

export const OPENAPI_VERSION = "1.0.0";

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("Citari API")
    .setDescription("Versioned HTTP contract for Citari's tenant, booking, and administration API.")
    .setVersion(OPENAPI_VERSION)
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config, { operationIdFactory: (controller, method) => `${controller}_${method}` });
}
