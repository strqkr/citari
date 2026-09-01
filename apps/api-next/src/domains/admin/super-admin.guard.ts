import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { CitariRequest } from "../../common/request-context.js";
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<CitariRequest>();
    if (request.principal?.globalRole !== "SUPER_ADMIN") throw new ForbiddenException("Super administrator access is required");
    return true;
  }
}
