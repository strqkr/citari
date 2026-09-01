"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet } from "@/lib/api";
import type { Page } from "@/types/page";

function unwrap<T>(res: Page<T> | T[]): T[] {
  return Array.isArray(res) ? res : res.items;
}

/** GET a list endpoint, accepting paginated API results and plain arrays. */
export async function apiList<T>(path: string): Promise<T[]> {
  return unwrap(await apiGet<Page<T> | T[]>(path));
}

/** Human-readable message from an ApiError (RFC 7807) or a generic fallback. */
export function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.detail || err.title : fallback;
}

/**
 * Loads a list resource from the production API.
 */
export function useResource<T>(path: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    apiList<T>(path)
      .then((rows) => {
        setItems(rows);
        setError(null);
      })
      .catch((err) => setError(errMessage(err, "No se pudo cargar la informacion.")))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { items, setItems, loading, error, setError, reload };
}

/** Single-object variant of {@link useResource} (e.g. the dashboard summary). */
export function useResourceOne<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiGet<T>(path)
      .then((row) => {
        setData(row);
        setError(null);
      })
      .catch((err) => setError(errMessage(err, "No se pudo cargar la informacion.")))
      .finally(() => setLoading(false));
  }, [path]);

  return { data, loading, error };
}
