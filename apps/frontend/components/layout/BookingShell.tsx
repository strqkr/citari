import Link from "next/link";

const steps = ["Negocio", "Servicio", "Fecha", "Datos", "Listo"];

export function BookingShell({
  children,
  currentStep
}: {
  children: React.ReactNode;
  currentStep?: number;
}) {
  return (
    <div
      data-ct
      className="flex min-h-[100dvh] flex-col bg-background font-sans text-foreground antialiased"
    >
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-6">
          <Link href="/" className="font-serif text-lg font-semibold tracking-tight">
            Citari
          </Link>
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Reserva en linea
          </span>
        </div>
      </header>

      {typeof currentStep === "number" ? (
        <div className="border-b border-border/60 bg-card/40">
          <ol className="mx-auto flex max-w-2xl items-center gap-2 px-6 py-3 text-xs">
            {steps.map((label, i) => {
              const state = i < currentStep ? "done" : i === currentStep ? "current" : "todo";
              return (
                <li key={label} className="flex flex-1 items-center gap-2">
                  <span
                    className={
                      state === "current"
                        ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground"
                        : state === "done"
                          ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary"
                          : "flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
                    }
                  >
                    {i + 1}
                  </span>
                  <span
                    className={`hidden sm:block ${state === "todo" ? "text-muted-foreground" : "text-foreground"}`}
                  >
                    {label}
                  </span>
                  {i < steps.length - 1 ? <span className="h-px flex-1 bg-border" /> : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">{children}</main>

      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        <Link href="/" className="transition-colors hover:text-foreground">
          Powered by Citari
        </Link>
      </footer>
    </div>
  );
}
