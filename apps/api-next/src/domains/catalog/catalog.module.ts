import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { DatabaseModule } from "../../database/database.module.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";

@Module({ imports: [AuthModule, DatabaseModule], controllers: [CatalogController], providers: [CatalogService], exports: [CatalogService] })
export class CatalogModule {}
