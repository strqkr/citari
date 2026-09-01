"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import type { Service, ServiceCategory } from "@/types/service";

export function useServices(tenantSlug: string) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const data = await apiGet<(ServiceCategory & { services: Service[] })[]>(endpoints.public.services(tenantSlug));
      if (active) {
        setServices(data.flatMap((category) => category.services.map((service) => ({ ...service, categoryId: category.id, category }))));
        setLoading(false);
      }
    }
    load().catch(() => {
      if (active) {
        setServices([]);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [tenantSlug]);

  return { services, loading };
}
