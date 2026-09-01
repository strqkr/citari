import { Module } from "@nestjs/common";
import { AbuseProtectionService } from "./abuse-protection.service.js";
import { SecurityMaintenanceService } from "./security-maintenance.service.js";

@Module({ providers: [AbuseProtectionService, SecurityMaintenanceService], exports: [AbuseProtectionService] })
export class SecurityModule {}
