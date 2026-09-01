export type AvailabilityBlock = { id: string; locationId: string; startsAt: string; endsAt: string; reason: string | null };
export type AvailabilityResponse = { timezone: string; slots: string[] };
