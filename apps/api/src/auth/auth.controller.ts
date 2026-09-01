import { Body, Controller, Get, HttpCode, Ip, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { CitariRequest } from "../common/request-context.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { AuthService } from "./auth.service.js";
import { ChangeInitialPasswordDto, IdentityEmailDto, LoginDto, LogoutDto, MfaConfirmationDto, MfaEnrollmentDto, RefreshDto, RegisterOwnerDto, ResetPasswordDto, VerifyEmailDto } from "./auth.dto.js";
@ApiTags("auth")
@ApiBearerAuth()
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post("register-owner") @HttpCode(201) registerOwner(@Body() body: RegisterOwnerDto, @Ip() ip: string, @Req() request: CitariRequest) { return this.auth.registerOwner(body, { ip, userAgent: request.headers["user-agent"] }); }
  @Post("login") @HttpCode(200) login(@Body() body: LoginDto, @Ip() ip: string, @Req() request: CitariRequest) { return this.auth.login(body.email, body.password, body.tenantId, { ip, userAgent: request.headers["user-agent"] }, body.mfaCode); }
  @Post("password/change-initial") @HttpCode(200) changeInitialPassword(@Body() body: ChangeInitialPasswordDto, @Ip() ip: string, @Req() request: CitariRequest) { return this.auth.changeInitialPassword(body.challengeToken, body.newPassword, { ip, userAgent: request.headers["user-agent"] }); }
  @Post("mfa/enroll") @HttpCode(200) beginMfaEnrollment(@Body() body: MfaEnrollmentDto, @Ip() ip: string, @Req() request: CitariRequest) { return this.auth.beginMfaEnrollment(body.challengeToken, { ip, userAgent: request.headers["user-agent"] }); }
  @Post("mfa/confirm") @HttpCode(200) confirmMfaEnrollment(@Body() body: MfaConfirmationDto, @Ip() ip: string, @Req() request: CitariRequest) { return this.auth.confirmMfaEnrollment(body.challengeToken, body.code, { ip, userAgent: request.headers["user-agent"] }); }
  @Post("email/verification/request") @HttpCode(202) requestEmailVerification(@Body() body: IdentityEmailDto, @Ip() ip: string) { return this.auth.requestEmailVerification(body.email, { ip }); }
  @Post("email/verify") @HttpCode(200) verifyEmail(@Body() body: VerifyEmailDto, @Ip() ip: string) { return this.auth.verifyEmail(body.challengeToken, { ip }); }
  @Post("password/reset/request") @HttpCode(202) requestPasswordReset(@Body() body: IdentityEmailDto, @Ip() ip: string) { return this.auth.requestPasswordReset(body.email, { ip }); }
  @Post("password/reset") @HttpCode(200) resetPassword(@Body() body: ResetPasswordDto, @Ip() ip: string) { return this.auth.resetPassword(body.challengeToken, body.newPassword, { ip }); }
  @Post("refresh") @HttpCode(200) refresh(@Body() body: RefreshDto, @Ip() ip: string, @Req() request: CitariRequest) { return this.auth.refresh(body.refreshToken, { ip, userAgent: request.headers["user-agent"] }); }
  @Post("logout") @HttpCode(204) async logout(@Body() body: LogoutDto): Promise<void> { await this.auth.logout(body.refreshToken); }
  @Get("me") @UseGuards(JwtAuthGuard) @ApiOperation({ summary: "Current authenticated principal" })
  me(@Req() request: CitariRequest) {
    if (!request.principal) throw new UnauthorizedException("Authentication context is unavailable");
    return this.auth.getProfile(request.principal.userId, request.principal.tenantId);
  }
}
