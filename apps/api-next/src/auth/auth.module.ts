import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
@Module({ controllers: [AuthController], providers: [JwtAuthGuard], exports: [JwtAuthGuard] })
export class AuthModule {}
