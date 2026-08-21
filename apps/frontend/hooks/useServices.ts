"use client";

import { useEffect, useState } from "react";
import { apiGet, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { mockServices } from "@/lib/mock-data";
import type { Service } from "@/types/service";

export function useServices(tenantSlug: string) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      if (isMockMode()) {
        setServices(mockServices);
        setLoading(false);
        return;
      }
      const data = await apiGet<Service[]>(endpoints.public.services(tenantSlug));
      if (active) {
        setServices(data);
        setLoading(false);
      }
    }
    load().catch(() => setLoading(false));
    return () => {
      active = false;
    };
  }, [tenantSlug]);

  return { services, loading };
}
