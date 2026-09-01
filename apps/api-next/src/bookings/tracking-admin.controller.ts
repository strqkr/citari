import { Controller, Param, ParseUUIDPipe, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { CitariRequest } from "../common/request-context.js";
import { TrackingService } from "./tracking.service.js";
@ApiTags("bookings") @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Controller("bookings")
export class TrackingAdminController {
  constructor(private readonly tracking: TrackingService) {}
  @Post(":id/tracking-token") issue(@Req() req: CitariRequest, @Param("id", ParseUUIDPipe) id: string) { if (!req.principal?.tenantId) throw new UnauthorizedException("Tenant context is required"); return this.tracking.issue(req.principal.tenantId, id); }
}
