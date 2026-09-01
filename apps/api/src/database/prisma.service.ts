import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../generated/prisma/client.js";
import { ENVIRONMENT, type Environment } from "../config/environment.js";

export type TransactionClient = Prisma.TransactionClient;
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENVIRONMENT) environment: Environment) {
    super({ adapter: new PrismaPg({ connectionString: environment.DATABASE_URL }) });
  }
  async onModuleDestroy(): Promise<void> { await this.$disconnect(); }
  async isReady(): Promise<boolean> {
    try { await this.$queryRaw`SELECT 1`; return true; } catch { return false; }
  }
  async withTenant<T>(tenantId: string, operation: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return operation(tx);
    });
  }
}
