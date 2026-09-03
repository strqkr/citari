export type BookingState = "HELD" | "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";

const transitions: Readonly<Record<BookingState, readonly BookingState[]>> = {
  HELD: ["PENDING", "CONFIRMED", "CANCELLED"],
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CANCELLED", "COMPLETED", "NO_SHOW"],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: []
};

export function transitionViolation(current: BookingState, target: BookingState, startAt: Date, endAt: Date, now = new Date()): string | null {
  if (!transitions[current].includes(target)) return `Cannot transition ${current} to ${target}`;
  if (target === "COMPLETED" && endAt > now) return "A booking cannot be completed before its scheduled end";
  if (target === "NO_SHOW" && startAt > now) return "A booking cannot be marked no-show before its scheduled start";
  return null;
}

export function customerMutationViolation(
  status: BookingState,
  startAt: Date,
  noticeMinutes: number,
  action: "cancel" | "reschedule",
  now = new Date()
): string | null {
  if (status !== "PENDING" && status !== "CONFIRMED") return `Booking cannot be ${action === "cancel" ? "cancelled" : "rescheduled"}`;
  if (startAt.getTime() - now.getTime() < noticeMinutes * 60_000) {
    return `${action === "cancel" ? "Cancellation" : "Rescheduling"} requires at least ${String(noticeMinutes)} minutes of notice`;
  }
  return null;
}

export function canOccupySchedule(status: BookingState): boolean {
  return status === "HELD" || status === "PENDING" || status === "CONFIRMED";
}
