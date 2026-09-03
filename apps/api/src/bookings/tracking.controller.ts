import { Body, Controller, HttpCode, Ip, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { AbuseProtectionService } from "../security/abuse-protection.service.js";
import { PublicCancelByTokenDto, PublicRescheduleByTokenDto, PublicTrackingLookupDto, PublicTrackingTokenDto, PublicTrackingVerifyDto } from "./tracking.dto.js";
import { TrackingService } from "./tracking.service.js";

@ApiTags("public")
@Controller("public/tracking")
export class TrackingController {
  constructor(private readonly tracking: TrackingService, private readonly abuse: AbuseProtectionService) {}

  @Post("verification/request")
  @HttpCode(202)
  @ApiOperation({ summary: "Send a secondary verification code for a tracking credential" })
  async requestVerification(@Body() body: PublicTrackingTokenDto, @Ip() ip = "unknown") {
    await Promise.all([
      this.abuse.assertAllowed("public.tracking.verification-request.ip", ip, 20, 60 * 60, 15 * 60),
      this.abuse.assertAllowed("public.tracking.verification-request.token", body.token, 3, 15 * 60, 15 * 60)
    ]);
    return this.tracking.requestVerification(body.token);
  }

  @Post("verification/confirm")
  @HttpCode(200)
  @ApiOperation({ summary: "Exchange a customer code for a short-lived tracking grant" })
  async verify(@Body() body: PublicTrackingVerifyDto, @Ip() ip = "unknown") {
    await Promise.all([
      this.abuse.assertAllowed("public.tracking.verification.ip", ip, 30, 60 * 60, 15 * 60),
      this.abuse.assertAllowed("public.tracking.verification.challenge", body.challengeToken, 8, 15 * 60, 15 * 60)
    ]);
    return this.tracking.verifyAccess(body.token, body.challengeToken, body.code);
  }

  @Post("lookup")
  @HttpCode(200)
  async lookup(@Body() body: PublicTrackingLookupDto, @Ip() ip = "unknown") {
    await this.protect("read", body.token, ip, 30);
    return this.tracking.get(body.token, body.accessGrant);
  }

  @Post("cancel")
  @HttpCode(200)
  async cancel(@Body() body: PublicCancelByTokenDto, @Ip() ip = "unknown") {
    await this.protect("write", body.token, ip, 8);
    return this.tracking.cancel(body.token, body.accessGrant, body.version, body.reason);
  }

  @Post("reschedule")
  @HttpCode(200)
  async reschedule(@Body() body: PublicRescheduleByTokenDto, @Ip() ip = "unknown") {
    await this.protect("write", body.token, ip, 8);
    return this.tracking.reschedule(body.token, body.accessGrant, body.version, body.startAt, body.reason);
  }

  private async protect(action: "read" | "write", token: string, ip: string, tokenLimit: number): Promise<void> {
    await Promise.all([
      this.abuse.assertAllowed(`public.tracking.${action}.ip`, ip, action === "read" ? 120 : 30, 60 * 60, 15 * 60),
      this.abuse.assertAllowed(`public.tracking.${action}.token`, token, tokenLimit, 15 * 60, 15 * 60)
    ]);
  }
}
