import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { jwtVerify } from "jose";
import { ENVIRONMENT, type Environment } from "../config/environment.js";
import type { AuthPrincipal, CitariRequest } from "../common/request-context.js";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly key: Uint8Array;
  constructor(@Inject(ENVIRONMENT) private readonly environment: Environment) {
    this.key = new TextEncoder().encode(environment.JWT_SECRET);
  }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CitariRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) throw new UnauthorizedException("Bearer token is required");
    try {
      const { payload } = await jwtVerify(authorization.slice(7), this.key, {
        issuer: this.environment.JWT_ISSUER, audience: this.environment.JWT_AUDIENCE,
        algorithms: ["HS256"]
      });
      if (!payload.sub) throw new Error("Token subject is missing");
      const principal: AuthPrincipal = { userId: payload.sub };
      if (payload.globalRole === "SUPER_ADMIN") principal.globalRole = payload.globalRole;
      if (typeof payload.tenantId === "string") principal.tenantId = payload.tenantId;
      if (payload.tenantRole === "OWNER" || payload.tenantRole === "ADMIN" || payload.tenantRole === "STAFF") principal.tenantRole = payload.tenantRole;
      request.principal = principal;
      return true;
    } catch { throw new UnauthorizedException("Bearer token is invalid or expired"); }
  }
}
