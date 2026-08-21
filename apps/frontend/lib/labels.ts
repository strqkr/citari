export const bookingStatusLabels = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
  rescheduled: "Reagendada"
} as const;

export const tenantStatusLabels = {
  pending: "Pendiente de activacion",
  active: "Activo",
  suspended: "Suspendido",
  inactive: "Inactivo"
} as const;

export const reportLabels = {
  dashboard: "Resumen general",
  dailyAgenda: "Agenda diaria",
  bookingsDetail: "Detalle de reservas",
  servicesDemand: "Servicios mas reservados",
  availabilityStatus: "Estado de disponibilidad"
} as const;

export const tenantFieldLabels = {
  name: "Nombre comercial",
  slug: "URL publica",
  email: "Correo del negocio",
  phone: "Telefono del negocio",
  description: "Descripcion publica",
  logoUrl: "URL del logo",
  publicMessage: "Mensaje publico para clientes"
} as const;

export const availabilityFieldLabels = {
  location: "Ubicacion",
  blockDate: "Fecha disponible",
  startTime: "Hora de inicio",
  endTime: "Hora de fin",
  isReserved: "Reservado",
  isActive: "Estado"
} as const;
