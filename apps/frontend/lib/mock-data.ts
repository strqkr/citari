import type { AvailabilityBlock } from "@/types/availability";
import type { Booking } from "@/types/booking";
import type { Service } from "@/types/service";
import type { Tenant } from "@/types/tenant";

export const mockTenant: Tenant = {
  tenantId: 1,
  slug: "clinica-dental-sonrisa",
  name: "Clinica Dental Sonrisa",
  description: "Atencion dental preventiva, estetica y familiar con cita previa.",
  publicMessage: "Reserva tu cita dental en linea de forma simple."
};

export const mockServices: Service[] = [
  {
    serviceId: 1,
    name: "Limpieza dental",
    description: "Evaluacion y limpieza preventiva.",
    durationMinutes: 45,
    price: 28000,
    showPrice: true
  },
  {
    serviceId: 2,
    name: "Consulta odontologica",
    description: "Revision general y plan de tratamiento.",
    durationMinutes: 30,
    price: 22000,
    showPrice: true
  }
];

export const mockAvailability: AvailabilityBlock[] = [
  { availabilityBlockId: 101, blockDate: "2026-05-20", startTime: "09:00", endTime: "09:30" },
  { availabilityBlockId: 102, blockDate: "2026-05-20", startTime: "10:00", endTime: "10:30", isReserved: true },
  { availabilityBlockId: 103, blockDate: "2026-05-20", startTime: "11:00", endTime: "11:30" }
];

export const mockBookings: Booking[] = [
  {
    bookingId: 3001,
    customerName: "Mateo Fernandez",
    serviceName: "Limpieza dental",
    bookingDate: "2026-05-20",
    startTime: "09:00",
    status: "confirmed",
    trackingCode: "CITARI-8F3K2A"
  },
  {
    bookingId: 3002,
    customerName: "Camila Ortiz",
    serviceName: "Consulta odontologica",
    bookingDate: "2026-05-20",
    startTime: "10:00",
    status: "pending",
    trackingCode: "CITARI-1X7D9Q"
  }
];
