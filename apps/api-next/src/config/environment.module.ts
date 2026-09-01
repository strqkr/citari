import { Global, Module } from "@nestjs/common";
import { ENVIRONMENT, parseEnvironment } from "./environment.js";
@Global()
@Module({ providers: [{ provide: ENVIRONMENT, useFactory: () => parseEnvironment(process.env) }], exports: [ENVIRONMENT] })
export class EnvironmentModule {}
