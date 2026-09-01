import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import type { ZodType } from "zod";
import type { CitariRequest } from "../common/request-context.js";

export const tenantIdFrom = (request: CitariRequest): string => {
  const tenantId = request.principal?.tenantId;
  if (!tenantId) throw new UnauthorizedException("An authenticated tenant context is required");
  return tenantId;
};

export const parseInput = <T>(schema: ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      message: "Request validation failed",
      errors: result.error.issues.map(({ path, message, code }) => ({ field: path.join("."), message, code })),
    });
  }
  return result.data;
};
