import { Controller, ForbiddenException, Get, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { CitariRequest } from "../common/request-context.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { PrismaService } from "../database/prisma.service.js";

@ApiTags("tenant")
@ApiBearerAuth()
@Controller("tenant")
export class TenantController {
  constructor(private readonly prisma: PrismaService) {}
  @Get("current") @UseGuards(JwtAuthGuard) @ApiOperation({ summary: "Current tenant profile" })
  async current(@Req() request: CitariRequest): Promise<object> {
    const tenantId = request.principal?.tenantId;
    if (!tenantId) throw new ForbiddenException("A tenant context is required");
    const tenant = await this.prisma.withTenant(tenantId, (tx) => tx.tenant.findUnique({
      where: { id: tenantId }, select: { id: true, name: true, slug: true, status: true, timezone: true, locale: true, currency: true }
    }));
    if (!tenant) throw new ForbiddenException("Tenant is unavailable");
    return tenant;
  }
}
