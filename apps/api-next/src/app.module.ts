import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { EnvironmentModule } from "./config/environment.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { TenantModule } from "./tenant/tenant.module.js";

@Module({
  imports: [EnvironmentModule, DatabaseModule, HealthModule, AuthModule, TenantModule]
})
export class AppModule {}
