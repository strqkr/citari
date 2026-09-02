import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { SecurityModule } from "../../security/security.module.js";
import { SchedulingModule } from "../../scheduling/scheduling.module.js";
import { PublicController } from "./public.controller.js";
import { PublicService } from "./public.service.js";

@Module({ imports: [DatabaseModule, SecurityModule, SchedulingModule], controllers: [PublicController], providers: [PublicService] })
export class PublicModule {}
