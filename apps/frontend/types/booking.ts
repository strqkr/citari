import type { Customer } from "./customer";
import type { Service } from "./service";
export type BookingStatus = "HELD" | "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
export type Booking = { id: string; customerId: string; serviceId: string; locationId: string; status: BookingStatus; startAt: string; endAt: string; serviceName: string; serviceDurationMinutes: number; servicePrice: string | number | null; currency: string; customerNotes: string | null; internalNotes: string | null; version: number; customer: Customer; service: Service; location: { id: string; name: string; timezone?: string | null } };
