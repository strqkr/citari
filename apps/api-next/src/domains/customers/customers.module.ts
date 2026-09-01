import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { DatabaseModule } from "../../database/database.module.js";
import { CustomersController } from "./customers.controller.js";
import { CustomersService } from "./customers.service.js";
@Module({ imports: [AuthModule, DatabaseModule], controllers: [CustomersController], providers: [CustomersService], exports: [CustomersService] })
export class CustomersModule {}
