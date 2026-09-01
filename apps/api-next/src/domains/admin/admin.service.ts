import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import type { AuthPrincipal } from "../../common/request-context.js";
import type { z } from "zod";
import type { createTenantSchema, statusReasonSchema, tenantListSchema } from "./admin.schemas.js";
type ListInput = z.infer<typeof tenantListSchema>; type CreateInput = z.infer<typeof createTenantSchema>; type Reason = z.infer<typeof statusReasonSchema>;
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}
  async list(query: ListInput) { const where = { ...(query.status ? { status: query.status } : {}), ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" as const } }, { slug: { contains: query.search, mode: "insensitive" as const } }] } : {}) }; const [items,total]=await Promise.all([this.prisma.tenant.findMany({where,orderBy:{createdAt:"desc"},skip:(query.page-1)*query.pageSize,take:query.pageSize}),this.prisma.tenant.count({where})]); return {items,pagination:{page:query.page,pageSize:query.pageSize,total,pages:Math.ceil(total/query.pageSize)}}; }
  async get(id:string) { const tenant=await this.prisma.tenant.findUnique({where:{id},include:{_count:{select:{memberships:true,customers:true,bookings:true,services:true,locations:true}}}}); if(!tenant) throw new NotFoundException("Tenant was not found"); return tenant; }
  async create(input:CreateInput, actor:AuthPrincipal) { if(await this.prisma.tenant.findUnique({where:{slug:input.slug},select:{id:true}})) throw new ConflictException("Tenant slug is already in use"); return this.prisma.$transaction(async tx=>{ const tenant=await tx.tenant.create({data:input}); await tx.auditEvent.create({data:{actorUserId:actor.userId,action:"TENANT_CREATED",entityType:"Tenant",entityId:tenant.id,metadata:{slug:tenant.slug}}}); return tenant; }); }
  async setStatus(id:string,status:"ACTIVE"|"SUSPENDED",input:Reason,actor:AuthPrincipal) { return this.prisma.$transaction(async tx=>{ const existing=await tx.tenant.findUnique({where:{id},select:{status:true}}); if(!existing) throw new NotFoundException("Tenant was not found"); const tenant=await tx.tenant.update({where:{id},data:{status}}); await tx.auditEvent.create({data:{tenantId:id,actorUserId:actor.userId,action:`TENANT_${status}`,entityType:"Tenant",entityId:id,reason:input.reason,metadata:{previousStatus:existing.status}}}); return tenant; }); }
}
