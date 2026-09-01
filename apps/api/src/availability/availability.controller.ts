import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { CitariRequest } from "../common/request-context.js";
import { AvailabilityService } from "./availability.service.js";
import { AvailabilityWindowQuery, CreateAvailabilityBlockDto } from "./availability.dto.js";

@ApiTags("availability")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("availability-blocks")
export class AvailabilityController {
  constructor(private readonly service: AvailabilityService) {}

  @Get()
  @ApiOperation({ summary: "List availability blocks overlapping a time window" })
  list(@Req() request: CitariRequest, @Query() query: AvailabilityWindowQuery) {
    return this.service.list(this.tenantId(request), query);
  }

  @Post()
  @ApiOperation({ summary: "Block a location time window" })
  create(@Req() request: CitariRequest, @Body() input: CreateAvailabilityBlockDto) {
    return this.service.create(this.tenantId(request), input);
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiOperation({ summary: "Remove an availability block" })
  remove(@Req() request: CitariRequest, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.service.remove(this.tenantId(request), id);
  }

  private tenantId(request: CitariRequest): string {
    const tenantId = request.principal?.tenantId;
    if (!tenantId) throw new ForbiddenException("A tenant context is required");
    return tenantId;
  }
}
