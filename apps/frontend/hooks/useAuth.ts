"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import type { AuthUser } from "@/types/auth";

export type AuthState = {
  user: AuthUser | null;
  loading: boolean;
};

/**
 * Rehidrata la sesion HttpOnly mediante GET /auth/me y deja la sesion como no
 * autenticada cuando el backend rechaza o expira las credenciales.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    let active = true;

    apiGet<AuthUser>(endpoints.auth.me)
      .then((user) => {
        if (active) setState({ user, loading: false });
      })
      .catch(() => {
        if (active) {
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
