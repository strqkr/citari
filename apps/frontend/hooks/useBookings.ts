"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import type { Booking } from "@/types/booking";
import type { Page } from "@/types/page";

export function useBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      // GET /bookings returns a paginated envelope ({items, page, pageSize,
      // total}), not a bare array - see app/routers/bookings.py::list_bookings.
      const data = await apiGet<Page<Booking>>(endpoints.bookings.list);
      setBookings(data.items);
      setLoading(false);
    }
    load().catch(() => {
      setBookings([]);
      setLoading(false);
    });
  }, []);

  return { bookings, loading };
}
