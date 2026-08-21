export type Booking = {
  bookingId: number;
  customerName: string;
  serviceName: string;
  bookingDate: string;
  startTime: string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "rescheduled";
  trackingCode: string;
};
