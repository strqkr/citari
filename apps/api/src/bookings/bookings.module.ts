import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BookingsController } from "./bookings.controller.js";
import { BookingsService } from "./bookings.service.js";
import { TrackingAdminController } from "./tracking-admin.controller.js";
import { TrackingController } from "./tracking.controller.js";
import { TrackingService } from "./tracking.service.js";
import { SecurityModule } from "../security/security.module.js";
import { SchedulingModule } from "../scheduling/scheduling.module.js";
@Module({ imports: [AuthModule, SecurityModule, SchedulingModule], controllers: [BookingsController, TrackingAdminController, TrackingController], providers: [BookingsService, TrackingService], exports: [BookingsService] })
export class BookingsModule {}
