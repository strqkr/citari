import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div
      data-ct
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center font-sans text-foreground antialiased"
    >
      <span className="font-mono text-sm font-semibold text-primary">404</span>
      <h1 className="font-serif text-4xl font-medium tracking-tight">Pagina no encontrada</h1>
      <p className="max-w-sm text-muted-foreground">
        La ruta que buscas no existe o ya no esta disponible.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link href="/" className={buttonVariants()}>
          Volver al inicio
        </Link>
        <Link href="/track" className={buttonVariants({ variant: "outline" })}>
          Consultar reserva
        </Link>
      </div>
    </div>
  );
}
