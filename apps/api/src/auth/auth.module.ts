import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { AuthService } from "./auth.service.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { SecurityModule } from "../security/security.module.js";
@Module({ imports: [NotificationsModule, SecurityModule], controllers: [AuthController], providers: [AuthService, JwtAuthGuard], exports: [AuthService, JwtAuthGuard] })
export class AuthModule {}
