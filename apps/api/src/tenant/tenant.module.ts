import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { TenantController } from "./tenant.controller.js";
@Module({ imports: [AuthModule], controllers: [TenantController] })
export class TenantModule {}
