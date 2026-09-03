import { Inject, Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { openSecret, sealSecret } from "../common/secret-box.js";
import { ENVIRONMENT, type Environment } from "../config/environment.js";
import { PrismaService, type TransactionClient } from "../database/prisma.service.js";

type Template = "EMAIL_VERIFICATION" | "PASSWORD_RESET" | "BOOKING_ACCESS_CODE";
interface ClaimedDelivery { id: string; recipient: string; template: Template; payloadEncrypted: string; attempts: number }
const PAYLOAD_CONTEXT = "citari:email-delivery:v1";
const MAX_ATTEMPTS = 10;

@Injectable()
export class NotificationOutboxService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly transporter: Transporter | null;
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;

  constructor(private readonly prisma: PrismaService, @Inject(ENVIRONMENT) private readonly env: Environment) {
    this.transporter = env.MAIL_TRANSPORT === "smtp" ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      pool: true,
      maxConnections: 3
    }) : null;
  }

  onApplicationBootstrap(): void {
    if (!this.transporter) return;
    void this.drainOnce();
    this.timer = setInterval(() => void this.drainOnce(), 15_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.transporter?.close();
  }

  async enqueue(tx: TransactionClient, userId: string, recipient: string, template: Template, token: string): Promise<void> {
    await this.enqueuePayload(tx, userId, `user:${userId}:${template}`, recipient, template, { token });
  }

  async enqueueBookingAccess(tx: TransactionClient, tenantId: string, bookingId: string, recipient: string, code: string): Promise<void> {
    await this.enqueuePayload(tx, null, `booking:${tenantId}:${bookingId}:BOOKING_ACCESS_CODE`, recipient, "BOOKING_ACCESS_CODE", { code });
  }

  private async enqueuePayload(tx: TransactionClient, userId: string | null, deduplicationKey: string, recipient: string, template: Template, payload: Record<string, string>): Promise<void> {
    const now = new Date();
    await tx.emailDelivery.updateMany({
      where: { deduplicationKey, sentAt: null },
      data: { sentAt: now, lockedAt: null, lastError: "Superseded by a newer security message" }
    });
    await tx.emailDelivery.create({ data: {
      userId,
      deduplicationKey,
      recipient: recipient.trim().toLowerCase(),
      template,
      payloadEncrypted: sealSecret(JSON.stringify(payload), this.env.NOTIFICATION_ENCRYPTION_KEY, PAYLOAD_CONTEXT)
    } });
  }

  async drainOnce(): Promise<number> {
    if (!this.transporter || this.draining) return 0;
    this.draining = true;
    try {
      const deliveries = await this.claimBatch();
      for (const delivery of deliveries) await this.deliver(delivery);
      return deliveries.length;
    } finally {
      this.draining = false;
    }
  }

  private claimBatch(): Promise<ClaimedDelivery[]> {
    return this.prisma.$transaction((tx) => tx.$queryRaw<ClaimedDelivery[]>`
      UPDATE "email_deliveries"
      SET "lockedAt" = now(), "attempts" = "attempts" + 1
      WHERE "id" IN (
        SELECT "id" FROM "email_deliveries"
        WHERE "sentAt" IS NULL
          AND "availableAt" <= now()
          AND "attempts" < ${MAX_ATTEMPTS}
          AND ("lockedAt" IS NULL OR "lockedAt" < now() - interval '10 minutes')
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 10
      )
      RETURNING "id", "recipient", "template", "payloadEncrypted", "attempts"
    `);
  }

  private async deliver(delivery: ClaimedDelivery): Promise<void> {
    const transporter = this.transporter;
    if (!transporter) return;
    try {
      const payload = JSON.parse(openSecret(delivery.payloadEncrypted, this.env.NOTIFICATION_ENCRYPTION_KEY, PAYLOAD_CONTEXT)) as { token?: unknown; code?: unknown };
      const message = this.render(delivery.template, payload);
      await transporter.sendMail({ from: this.env.MAIL_FROM, to: delivery.recipient, subject: message.subject, text: message.text, html: message.html });
      await this.prisma.emailDelivery.update({ where: { id: delivery.id }, data: { sentAt: new Date(), lockedAt: null, lastError: null } });
    } catch {
      const delayMinutes = Math.min(2 ** Math.max(0, delivery.attempts - 1), 24 * 60);
      await this.prisma.emailDelivery.update({ where: { id: delivery.id }, data: {
        lockedAt: null,
        availableAt: new Date(Date.now() + delayMinutes * 60_000),
        lastError: "Delivery attempt failed"
      } });
    }
  }

  private render(template: Template, payload: { token?: unknown; code?: unknown }) {
    if (template === "BOOKING_ACCESS_CODE") {
      if (typeof payload.code !== "string" || !/^\d{6}$/.test(payload.code)) throw new Error("Invalid delivery payload");
      return {
        subject: "Código para consultar tu reserva en Citari",
        text: `Tu código de verificación es ${payload.code}. Vence en 10 minutos.\n\nSi no solicitaste acceso a una reserva, ignora este mensaje.`,
        html: `<p>Tu código para consultar la reserva es:</p><p style="font-size:24px;font-weight:700;letter-spacing:0.2em">${payload.code}</p><p>Vence en 10 minutos. Si no solicitaste este acceso, ignora el mensaje.</p>`
      };
    }
    if (typeof payload.token !== "string") throw new Error("Invalid delivery payload");
    const path = template === "EMAIL_VERIFICATION" ? "/verify-email" : "/reset-password";
    const url = new URL(path, this.env.APP_PUBLIC_URL);
    url.hash = new URLSearchParams({ token: payload.token }).toString();
    if (template === "EMAIL_VERIFICATION") {
      return {
        subject: "Verifica tu correo en Citari",
        text: `Verifica tu correo abriendo este enlace: ${url.toString()}\n\nSi no creaste esta cuenta, ignora este mensaje.`,
        html: `<p>Verifica tu correo para continuar en Citari.</p><p><a href="${url.toString()}">Verificar correo</a></p><p>Si no creaste esta cuenta, ignora este mensaje.</p>`
      };
    }
    return {
      subject: "Restablece tu contraseña de Citari",
      text: `Restablece tu contraseña abriendo este enlace: ${url.toString()}\n\nSi no solicitaste el cambio, ignora este mensaje.`,
      html: `<p>Recibimos una solicitud para restablecer tu contraseña.</p><p><a href="${url.toString()}">Crear nueva contraseña</a></p><p>Si no solicitaste el cambio, ignora este mensaje.</p>`
    };
  }
}
