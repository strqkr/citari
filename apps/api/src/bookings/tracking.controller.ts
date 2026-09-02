import { Body, Controller, Get, HttpCode, Ip, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { TrackingService } from "./tracking.service.js";
import { PublicCancelByTokenDto, PublicCancelDto, PublicRescheduleByTokenDto, PublicRescheduleDto, PublicTrackingLookupDto } from "./tracking.dto.js";
import { AbuseProtectionService } from "../security/abuse-protection.service.js";
@ApiTags("public") @Controller("public/tracking")
export class TrackingController {
  constructor(private readonly tracking: TrackingService, private readonly abuse: AbuseProtectionService) {}
  @Post("lookup") @HttpCode(200) async lookup(@Body() body: PublicTrackingLookupDto, @Ip() ip = "unknown") { await this.protect("read", body.token, ip, 30); return this.tracking.get(body.token); }
  @Post("cancel") @HttpCode(200) async cancelByToken(@Body() body: PublicCancelByTokenDto, @Ip() ip = "unknown") { await this.protect("write", body.token, ip, 8); return this.tracking.cancel(body.token, body.version, body.reason); }
  @Post("reschedule") @HttpCode(200) async rescheduleByToken(@Body() body: PublicRescheduleByTokenDto, @Ip() ip = "unknown") { await this.protect("write", body.token, ip, 8); return this.tracking.reschedule(body.token, body.version, body.startAt, body.reason); }
  @Get(":token") async get(@Param("token") token: string, @Ip() ip = "unknown") { await this.protect("read", token, ip, 30); return this.tracking.get(token); }
  @Post(":token/cancel") @HttpCode(200) async cancel(@Param("token") token: string, @Body() body: PublicCancelDto, @Ip() ip = "unknown") { await this.protect("write", token, ip, 8); return this.tracking.cancel(token, body.version, body.reason); }
  @Post(":token/reschedule") @HttpCode(200) async reschedule(@Param("token") token: string, @Body() body: PublicRescheduleDto, @Ip() ip = "unknown") { await this.protect("write", token, ip, 8); return this.tracking.reschedule(token, body.version, body.startAt, body.reason); }
  private async protect(action: "read" | "write", token: string, ip: string, tokenLimit: number): Promise<void> {
    await Promise.all([
      this.abuse.assertAllowed(`public.tracking.${action}.ip`, ip, action === "read" ? 120 : 30, 60 * 60, 15 * 60),
      this.abuse.assertAllowed(`public.tracking.${action}.token`, token, tokenLimit, 15 * 60, 15 * 60)
    ]);
  }
}
