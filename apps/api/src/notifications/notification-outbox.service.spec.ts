import nodemailer from "nodemailer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openSecret, sealSecret } from "../common/secret-box.js";
import { NotificationOutboxService } from "./notification-outbox.service.js";

vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn() } }));

const env = {
  MAIL_TRANSPORT: "smtp",
  SMTP_HOST: "smtp.test",
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  SMTP_USER: "user",
  SMTP_PASSWORD: "password",
  MAIL_FROM: "notify@example.test",
  APP_PUBLIC_URL: "https://citari.test",
  NOTIFICATION_ENCRYPTION_KEY: "n".repeat(32)
};

describe("NotificationOutboxService", () => {
  let prisma: any;
  let transaction: any;
  let transporter: { sendMail: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  let service: NotificationOutboxService;

  beforeEach(() => {
    transaction = { $queryRaw: vi.fn() };
    prisma = { $transaction: vi.fn((operation) => operation(transaction)), emailDelivery: { update: vi.fn() } };
    transporter = { sendMail: vi.fn(), close: vi.fn() };
    vi.mocked(nodemailer.createTransport).mockReturnValue(transporter as never);
    service = new NotificationOutboxService(prisma, env as never);
  });

  it("supersedes stale messages and encrypts the queued token", async () => {
    const tx = { emailDelivery: { updateMany: vi.fn(), create: vi.fn() } };
    await service.enqueue(tx as never, "user", " Owner@Example.com ", "EMAIL_VERIFICATION", "raw-token");
    expect(tx.emailDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user", template: "EMAIL_VERIFICATION", sentAt: null } }));
    const data = tx.emailDelivery.create.mock.calls[0]?.[0]?.data;
    expect(data.recipient).toBe("owner@example.com");
    expect(data.payloadEncrypted).not.toContain("raw-token");
    expect(openSecret(data.payloadEncrypted, "n".repeat(32), "citari:email-delivery:v1")).toBe('{"token":"raw-token"}');
  });

  it("claims and sends a fragment-based verification link without leaking through a query", async () => {
    transaction.$queryRaw.mockResolvedValue([{ id: "delivery", recipient: "owner@example.com", template: "EMAIL_VERIFICATION", payloadEncrypted: encrypted("verify-token"), attempts: 1 }]);
    await expect(service.drainOnce()).resolves.toBe(1);
    const message = transporter.sendMail.mock.calls[0]?.[0];
    expect(message.text).toContain("/verify-email#token=verify-token");
    expect(message.text).not.toContain("?token=");
    expect(prisma.emailDelivery.update).toHaveBeenCalledWith({ where: { id: "delivery" }, data: expect.objectContaining({ sentAt: expect.any(Date), lastError: null }) });
  });

  it("releases failed deliveries with bounded exponential backoff", async () => {
    transaction.$queryRaw.mockResolvedValue([{ id: "delivery", recipient: "owner@example.com", template: "PASSWORD_RESET", payloadEncrypted: encrypted("reset-token"), attempts: 3 }]);
    transporter.sendMail.mockRejectedValue(new Error("provider unavailable"));
    await expect(service.drainOnce()).resolves.toBe(1);
    expect(prisma.emailDelivery.update).toHaveBeenCalledWith({ where: { id: "delivery" }, data: expect.objectContaining({ lockedAt: null, lastError: "Delivery attempt failed", availableAt: expect.any(Date) }) });
  });

  it("does not start delivery when transport is explicitly disabled", async () => {
    const disabled = new NotificationOutboxService(prisma, { ...env, MAIL_TRANSPORT: "disabled" } as never);
    await expect(disabled.drainOnce()).resolves.toBe(0);
    disabled.onApplicationBootstrap();
    disabled.onModuleDestroy();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  function encrypted(token: string): string {
    return sealSecret(JSON.stringify({ token }), "n".repeat(32), "citari:email-delivery:v1");
  }
});
