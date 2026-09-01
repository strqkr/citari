import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard.js";
import type { CitariRequest } from "../../common/request-context.js";
import { parseInput, tenantIdFrom } from "../domain-http.js";
import { CustomersService } from "./customers.service.js";
import { createCustomerSchema, customerQuerySchema, updateCustomerSchema } from "./customers.schemas.js";

@ApiTags("customers") @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Controller("customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}
  @Get() list(@Req() request: CitariRequest, @Query() query: unknown) { return this.customers.list(tenantIdFrom(request), parseInput(customerQuerySchema, query)); }
  @Get(":id") get(@Req() request: CitariRequest, @Param("id", ParseUUIDPipe) id: string) { return this.customers.get(tenantIdFrom(request), id); }
  @Post() create(@Req() request: CitariRequest, @Body() body: unknown) { return this.customers.create(tenantIdFrom(request), parseInput(createCustomerSchema, body)); }
  @Patch(":id") update(@Req() request: CitariRequest, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) { return this.customers.update(tenantIdFrom(request), id, parseInput(updateCustomerSchema, body)); }
  @Delete(":id") anonymize(@Req() request: CitariRequest, @Param("id", ParseUUIDPipe) id: string) { return this.customers.anonymize(tenantIdFrom(request), id); }
}
