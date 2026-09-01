import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AvailabilityController } from "./availability.controller.js";
import { AvailabilityService } from "./availability.service.js";

@Module({ imports: [AuthModule], controllers: [AvailabilityController], providers: [AvailabilityService] })
export class AvailabilityModule {}
