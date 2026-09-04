import type { IncomingMessage } from "node:http";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { FastifyRequest } from "fastify";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import { ProblemDetailsFilter } from "./common/problem-details.filter.js";
import { redactSensitiveUrl } from "./common/log-redaction.js";
import { resolveRequestId } from "./common/request-id.js";
import { ENVIRONMENT, parseEnvironment, type Environment } from "./config/environment.js";
import { buildOpenApiDocument } from "./openapi.js";

export async function createApplication(options: { initialize?: boolean } = {}): Promise<NestFastifyApplication> {
  const bootstrapEnvironment = parseEnvironment(process.env);
  const trustProxy = bootstrapEnvironment.TRUST_PROXY_HOPS > 0
    ? (_address: string, hop: number) => hop < bootstrapEnvironment.TRUST_PROXY_HOPS
    : false;
  const adapter = new FastifyAdapter({ trustProxy, logger: { serializers: { req: (request: FastifyRequest) => ({ method: request.method, url: redactSensitiveUrl(request.url), host: request.hostname, remoteAddress: request.ip }) } }, genReqId: (request: IncomingMessage) => {
    return resolveRequestId(request.headers["x-request-id"]);
  }});
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);
  const environment = app.get<Environment>(ENVIRONMENT);
  await app.register(helmet, { contentSecurityPolicy: environment.NODE_ENV === "production" });
  await app.register(cors, { origin: environment.corsOrigins, credentials: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new ProblemDetailsFilter());
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup("docs", app, document, { jsonDocumentUrl: "openapi.json" });
  if (options.initialize !== false) {
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }
  return app;
}
