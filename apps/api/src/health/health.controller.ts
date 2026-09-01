import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../database/prisma.service.js";
@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get("live") @ApiOperation({ summary: "Process liveness" }) live(): { status: string } { return { status: "ok" }; }
  @Get("ready") @ApiOperation({ summary: "Dependency readiness" }) async ready(): Promise<{ status: string }> {
    if (!(await this.prisma.isReady())) throw new ServiceUnavailableException("Database is unavailable");
    return { status: "ready" };
  }
}
