import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard.js";
import type { CitariRequest } from "../../common/request-context.js";
import { parseInput, tenantIdFrom } from "../domain-http.js";
import { CatalogService } from "./catalog.service.js";
import { createCategorySchema, createLocationSchema, createServiceSchema, paginationSchema, replaceBusinessHoursSchema, updateCategorySchema, updateLocationSchema, updateServiceSchema } from "./catalog.schemas.js";

@ApiTags("catalog") @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get("service-categories") listCategories(@Req() request: CitariRequest, @Query() query: unknown) { return this.catalog.listCategories(tenantIdFrom(request), parseInput(paginationSchema, query)); }
  @Post("service-categories") createCategory(@Req() request: CitariRequest, @Body() body: unknown) { return this.catalog.createCategory(tenantIdFrom(request), parseInput(createCategorySchema, body)); }
  @Patch("service-categories/:id") updateCategory(@Req() request: CitariRequest, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) { return this.catalog.updateCategory(tenantIdFrom(request), id, parseInput(updateCategorySchema, body)); }
  @Delete("service-categories/:id") @HttpCode(204) deleteCategory(@Req() request: CitariRequest, @Param("id", ParseUUIDPipe) id: string) { return this.catalog.deleteCategory(tenantIdFrom(request), id); }

  @Get("services") listServices(@Req() request: CitariRequest, @Query() query: unknown) { return this.catalog.listServices(tenantIdFrom(request), parseInput(paginationSchema, query)); }
  @Post("services") createService(@Req() request: CitariRequest, @Body() body: unknown) { return this.catalog.createService(tenantIdFrom(request), parseInput(createServiceSchema, body)); }
  @Patch("services/:id") updateService(@Req() request: CitariRequest, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) { return this.catalog.updateService(tenantIdFrom(request), id, parseInput(updateServiceSchema, body)); }
  @Delete("services/:id") archiveService(@Req() request: CitariRequest, @Param("id", ParseUUIDPipe) id: string) { return this.catalog.archiveService(tenantIdFrom(request), id); }

  @Get("locations") listLocations(@Req() request: CitariRequest, @Query() query: unknown) { return this.catalog.listLocations(tenantIdFrom(request), parseInput(paginationSchema, query)); }
  @Post("locations") createLocation(@Req() request: CitariRequest, @Body() body: unknown) { return this.catalog.createLocation(tenantIdFrom(request), parseInput(createLocationSchema, body)); }
  @Patch("locations/:id") updateLocation(@Req() request: CitariRequest, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) { return this.catalog.updateLocation(tenantIdFrom(request), id, parseInput(updateLocationSchema, body)); }
  @Delete("locations/:id") archiveLocation(@Req() request: CitariRequest, @Param("id", ParseUUIDPipe) id: string) { return this.catalog.archiveLocation(tenantIdFrom(request), id); }
  @Put("locations/:id/business-hours") replaceHours(@Req() request: CitariRequest, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) { return this.catalog.replaceBusinessHours(tenantIdFrom(request), id, parseInput(replaceBusinessHoursSchema, body)); }
}
