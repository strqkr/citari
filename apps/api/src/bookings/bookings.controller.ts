import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { CitariRequest } from "../common/request-context.js";
import { BookingStatus } from "../generated/prisma/enums.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { BookingsService } from "./bookings.service.js";
import { CreateBookingDto, ListBookingsQuery, RescheduleBookingDto, TransitionBookingDto } from "./bookings.dto.js";
@ApiTags("bookings") @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Controller("bookings")
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}
  @Get() list(@Req() req: CitariRequest, @Query() query: ListBookingsQuery) { return this.bookings.list(this.tenant(req), query); }
  @Get(":id") get(@Req() req: CitariRequest, @Param("id", ParseUUIDPipe) id: string) { return this.bookings.get(this.tenant(req), id); }
  @Post() create(@Req() req: CitariRequest, @Body() body: CreateBookingDto) { return this.bookings.create(this.tenant(req), this.user(req), body); }
  @Patch(":id/confirm") confirm(@Req() req: CitariRequest, @Param("id", ParseUUIDPipe) id: string, @Body() body: TransitionBookingDto) { return this.bookings.transition(this.tenant(req), id, this.user(req), BookingStatus.CONFIRMED, body.version, body.reason); }
  @Patch(":id/cancel") cancel(@Req() req: CitariRequest, @Param("id", ParseUUIDPipe) id: string, @Body() body: TransitionBookingDto) { return this.bookings.transition(this.tenant(req), id, this.user(req), BookingStatus.CANCELLED, body.version, body.reason); }
  @Patch(":id/complete") complete(@Req() req: CitariRequest, @Param("id", ParseUUIDPipe) id: string, @Body() body: TransitionBookingDto) { return this.bookings.transition(this.tenant(req), id, this.user(req), BookingStatus.COMPLETED, body.version, body.reason); }
  @Patch(":id/reschedule") reschedule(@Req() req: CitariRequest, @Param("id", ParseUUIDPipe) id: string, @Body() body: RescheduleBookingDto) { return this.bookings.reschedule(this.tenant(req), id, this.user(req), body.version, body.startAt, body.reason); }
  private tenant(req: CitariRequest): string { if (!req.principal?.tenantId) throw new UnauthorizedException("Tenant context is required"); return req.principal.tenantId; }
  private user(req: CitariRequest): string { if (!req.principal?.userId) throw new UnauthorizedException(); return req.principal.userId; }
}
