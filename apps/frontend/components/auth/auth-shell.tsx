import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  eyebrow: string;
  title: ReactNode;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  aside?: ReactNode;
};

export function AuthShell({ eyebrow, title, subtitle, children, footer, aside }: AuthShellProps) {
  return (
    <div
      data-ct
      className="grid min-h-[100dvh] bg-background font-sans text-foreground antialiased lg:grid-cols-2"
    >
      {/* Panel editorial (solo desktop) */}
      <aside className="relative hidden overflow-hidden bg-foreground p-12 text-background lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-16 top-1/3 h-96 w-96 rounded-full bg-primary/25 blur-[120px]" />
          <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-primary/10 blur-[100px]" />
        </div>
        <Link href="/" className="relative font-serif text-2xl font-semibold tracking-tight">
          Citari
        </Link>
        <div className="relative">
          {aside ?? (
            <p className="max-w-md font-serif text-3xl leading-snug">
              Reservas que fluyen, negocios que <em className="italic text-primary">respiran</em>.
            </p>
          )}
        </div>
        <p className="relative text-sm text-background/60">Reservas para negocios de servicios.</p>
      </aside>

      {/* Area de formulario */}
      <main className="flex flex-col justify-center px-6 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <Link
            href="/"
            className="font-serif text-2xl font-semibold tracking-tight text-foreground lg:hidden"
          >
            Citari
          </Link>

          <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-primary lg:mt-0">
            {eyebrow}
          </p>
          <h1 className="mt-2 font-serif text-3xl font-medium tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>

          <div className="mt-8">{children}</div>

          {footer ? <div className="mt-6 text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
