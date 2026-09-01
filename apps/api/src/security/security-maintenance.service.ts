import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class SecurityMaintenanceService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    void this.cleanup();
    this.timer = setInterval(() => void this.cleanup(), 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async cleanup(now = new Date()): Promise<void> {
    const retentionCutoff = new Date(now.getTime() - RETENTION_MS);
    await this.prisma.$transaction([
      this.prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.authChallenge.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.emailDelivery.deleteMany({ where: { OR: [
        { sentAt: { lt: retentionCutoff } },
        { attempts: { gte: 10 }, availableAt: { lt: retentionCutoff } }
      ] } })
    ]);
  }
}
