export const endpoints = {
  auth: {
    login: "/auth/login",
    registerOwner: "/auth/register-owner",
    me: "/auth/me",
    logout: "/auth/logout"
  },
  admin: {
    tenants: "/admin/tenants",
    tenantById: (id: number | string) => `/admin/tenants/${id}`,
    activateTenant: (id: number | string) => `/admin/tenants/${id}/activate`,
    suspendTenant: (id: number | string) => `/admin/tenants/${id}/suspend`
  },
  tenant: {
    current: "/tenant/current"
  },
  businessTypes: "/business-types",
  serviceCategories: {
    list: "/service-categories",
    byId: (id: number | string) => `/service-categories/${id}`
  },
  services: {
    list: "/services",
    byId: (id: number | string) => `/services/${id}`
  },
  locations: {
    list: "/locations",
    byId: (id: number | string) => `/locations/${id}`
  },
  businessHours: "/business-hours",
  availabilityBlocks: {
    list: "/availability-blocks",
    byId: (id: number | string) => `/availability-blocks/${id}`
  },
  customers: {
    list: "/customers",
    byId: (id: number | string) => `/customers/${id}`,
    bookings: (id: number | string) => `/customers/${id}/bookings`
  },
  bookings: {
    list: "/bookings",
    byId: (id: number | string) => `/bookings/${id}`,
    confirm: (id: number | string) => `/bookings/${id}/confirm`,
    cancel: (id: number | string) => `/bookings/${id}/cancel`,
    complete: (id: number | string) => `/bookings/${id}/complete`,
    reschedule: (id: number | string) => `/bookings/${id}/reschedule`
  },
  reports: {
    dashboard: "/reports/dashboard",
    dailyAgenda: "/reports/daily-agenda",
    bookingsDetail: "/reports/bookings-detail",
    servicesDemand: "/reports/services-demand",
    availabilityStatus: "/reports/availability-status"
  },
  auditLogs: "/audit-logs",
  public: {
    tenant: (slug: string) => `/public/${slug}`,
    services: (slug: string) => `/public/${slug}/services`,
    availability: (slug: string) => `/public/${slug}/availability`,
    bookings: (slug: string) => `/public/${slug}/bookings`
  },
  track: {
    get: (code: string) => `/track/${code}`,
    cancel: (code: string) => `/track/${code}/cancel`,
    reschedule: (code: string) => `/track/${code}/reschedule`
  }
} as const;
