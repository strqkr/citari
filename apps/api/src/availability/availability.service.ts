import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AvailabilityBlock } from "../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import { SchedulingIntegrityService } from "../scheduling/scheduling-integrity.service.js";
import type { AvailabilityWindowQuery, CreateAvailabilityBlockDto } from "./availability.dto.js";

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduling: SchedulingIntegrityService
  ) {}

  list(tenantId: string, query: AvailabilityWindowQuery): Promise<AvailabilityBlock[]> {
    if (query.from >= query.to) throw new BadRequestException("from must be earlier than to");
    return this.prisma.withTenant(tenantId, (tx) => tx.availabilityBlock.findMany({
      where: {
        tenantId,
        ...(query.locationId ? { locationId: query.locationId } : {}),
        startsAt: { lt: query.to },
        endsAt: { gt: query.from }
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }]
    }));
  }

  create(tenantId: string, input: CreateAvailabilityBlockDto): Promise<AvailabilityBlock> {
    if (input.startsAt >= input.endsAt) throw new BadRequestException("startsAt must be earlier than endsAt");
    return this.prisma.withTenant(tenantId, async (tx) => {
      const location = await tx.location.findFirst({ where: { id: input.locationId, tenantId, isActive: true }, select: { id: true } });
      if (!location) throw new NotFoundException("Location not found");
      await this.scheduling.lockLocation(tx, tenantId, location.id);
      await this.scheduling.assertBlockAvailable(tx, { tenantId, locationId: location.id, startsAt: input.startsAt, endsAt: input.endsAt });
      return tx.availabilityBlock.create({ data: {
        tenantId,
        locationId: input.locationId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        ...(input.reason === undefined ? {} : { reason: input.reason })
      } });
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const removed = await this.prisma.withTenant(tenantId, (tx) => tx.availabilityBlock.deleteMany({ where: { id, tenantId } }));
    if (removed.count === 0) throw new NotFoundException("Availability block not found");
  }
}
