import { Module } from "@nestjs/common";
import { SchedulingIntegrityService } from "./scheduling-integrity.service.js";

@Module({ providers: [SchedulingIntegrityService], exports: [SchedulingIntegrityService] })
export class SchedulingModule {}
