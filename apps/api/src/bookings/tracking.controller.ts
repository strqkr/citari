import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { TrackingService } from "./tracking.service.js";
import { PublicCancelDto, PublicRescheduleDto } from "./tracking.dto.js";
@ApiTags("public") @Controller("public/tracking")
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}
  @Get(":token") get(@Param("token") token: string) { return this.tracking.get(token); }
  @Post(":token/cancel") @HttpCode(200) cancel(@Param("token") token: string, @Body() body: PublicCancelDto) { return this.tracking.cancel(token, body.version, body.reason); }
  @Post(":token/reschedule") @HttpCode(200) reschedule(@Param("token") token: string, @Body() body: PublicRescheduleDto) { return this.tracking.reschedule(token, body.version, body.startAt, body.reason); }
}
