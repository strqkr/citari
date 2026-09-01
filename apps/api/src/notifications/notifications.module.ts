import { Module } from "@nestjs/common";
import { NotificationOutboxService } from "./notification-outbox.service.js";

@Module({ providers: [NotificationOutboxService], exports: [NotificationOutboxService] })
export class NotificationsModule {}
