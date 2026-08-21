"use client";

import { useEffect } from "react";

export function Modal({
  open,
  onClose,
  title,
  children
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div data-ct className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-lift"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl font-medium">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
