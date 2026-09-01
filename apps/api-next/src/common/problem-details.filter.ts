import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

interface ErrorBody { message?: string | string[]; error?: string }
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const response = exception instanceof HttpException ? exception.getResponse() : undefined;
    const body = typeof response === "object" ? response as ErrorBody : undefined;
    const rawDetail = body?.message;
    const detail = status >= 500 ? "An unexpected error occurred." : Array.isArray(rawDetail) ? rawDetail.join("; ") : rawDetail ?? "Request failed.";
    reply.status(status).type("application/problem+json").send({
      type: `https://api.citari.app/problems/http-${String(status)}`,
      title: body?.error ?? (status >= 500 ? "Internal Server Error" : "Request Error"),
      status, detail, instance: request.url, requestId: request.id
    });
  }
}
