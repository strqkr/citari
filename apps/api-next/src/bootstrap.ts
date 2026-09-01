import type { IncomingMessage } from "node:http";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import { ProblemDetailsFilter } from "./common/problem-details.filter.js";
import { resolveRequestId } from "./common/request-id.js";
import { ENVIRONMENT, type Environment } from "./config/environment.js";

export async function createApplication(): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({ logger: true, genReqId: (request: IncomingMessage) => {
    return resolveRequestId(request.headers["x-request-id"]);
  }});
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);
  const environment = app.get<Environment>(ENVIRONMENT);
  await app.register(helmet, { contentSecurityPolicy: environment.NODE_ENV === "production" });
  await app.register(cors, { origin: environment.corsOrigins, credentials: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new ProblemDetailsFilter());
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle("Citari API").setVersion("1.0").addBearerAuth().build());
  SwaggerModule.setup("docs", app, document, { jsonDocumentUrl: "openapi.json" });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
