import { Controller, Get, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthPrincipal, CitariRequest } from "../common/request-context.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
@ApiTags("auth")
@ApiBearerAuth()
@Controller("auth")
export class AuthController {
  @Get("me") @UseGuards(JwtAuthGuard) @ApiOperation({ summary: "Current authenticated principal" })
  me(@Req() request: CitariRequest): AuthPrincipal {
    if (!request.principal) throw new UnauthorizedException("Authentication context is unavailable");
    return request.principal;
  }
}
