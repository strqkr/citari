import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { AuthService } from "./auth.service.js";
@Module({ controllers: [AuthController], providers: [AuthService, JwtAuthGuard], exports: [AuthService, JwtAuthGuard] })
export class AuthModule {}
