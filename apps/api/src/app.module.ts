import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { AvailabilityModule } from "./availability/availability.module.js";
import { BookingsModule } from "./bookings/bookings.module.js";
import { EnvironmentModule } from "./config/environment.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { TenantModule } from "./tenant/tenant.module.js";
import { AdminModule } from "./domains/admin/admin.module.js";
import { CatalogModule } from "./domains/catalog/catalog.module.js";
import { CustomersModule } from "./domains/customers/customers.module.js";
import { ReportsModule } from "./domains/reports/reports.module.js";
import { PublicModule } from "./domains/public/public.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { SecurityModule } from "./security/security.module.js";

@Module({
  imports: [
    EnvironmentModule,
    DatabaseModule,
    NotificationsModule,
    SecurityModule,
    HealthModule,
    AuthModule,
    TenantModule,
    AvailabilityModule,
    CatalogModule,
    CustomersModule,
    BookingsModule,
    PublicModule,
    ReportsModule,
    AdminModule
  ]
})
export class AppModule {}
