"use client";

import { useEffect, useState } from "react";
import { apiGet, clearAuthToken, getAuthToken, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import type { AuthUser } from "@/types/auth";

const MOCK_USER: AuthUser = {
  id: 1,
  firstName: "Sofia",
  lastName: "Campos",
  email: "owner@demo.citari",
  role: "owner",
  tenantId: 1
};

export type AuthState = {
  user: AuthUser | null;
  loading: boolean;
};

/**
 * Rehidrata la sesion del owner/superadmin a partir del token guardado.
 * En modo mock devuelve un usuario ficticio; en modo api consulta GET /auth/me
 * y, si el token no sirve, lo limpia y deja la sesion como no autenticada.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    let active = true;

    if (isMockMode()) {
      setState({ user: MOCK_USER, loading: false });
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setState({ user: null, loading: false });
      return;
    }

    apiGet<AuthUser>(endpoints.auth.me)
      .then((user) => {
        if (active) setState({ user, loading: false });
      })
      .catch(() => {
        if (active) {
          clearAuthToken();
          setState({ user: null, loading: false });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return state;
}

export function userInitials(user: AuthUser | null): string {
  if (!user) return "";
  const first = user.firstName?.trim()?.[0] ?? "";
  const last = user.lastName?.trim()?.[0] ?? "";
  return `${first}${last}`.toUpperCase() || (user.email?.[0]?.toUpperCase() ?? "");
}
