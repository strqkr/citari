import Link from "next/link";
import { ArrowRight, CalendarCheck, Check, Clock3, LayoutGrid, Link2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

const sectors = ["Barberias", "Salones", "Spas", "Clinicas", "Consultorios", "Veterinarias", "Estetica"];

const agenda = [
  { time: "09:00", name: "Mateo Jimenez", service: "Corte de cabello", tone: "confirmada" as const },
  { time: "10:30", name: "Valeria Rojas", service: "Corte + barba", tone: "confirmada" as const },
  { time: "12:00", name: "Sebastian Mora", service: "Barba y perfilado", tone: "pendiente" as const },
  { time: "15:00", name: "Camila Vargas", service: "Corte de cabello", tone: "confirmada" as const }
];

const steps = [
  { icon: LayoutGrid, title: "Arma tu catalogo", body: "Crea tus servicios, sedes y horarios de atencion en minutos." },
  { icon: Link2, title: "Comparte tu enlace", body: "Cada negocio tiene su propia pagina publica de reservas." },
  { icon: CalendarCheck, title: "Recibe reservas", body: "Tus clientes eligen dia y hora; tu confirmas desde el panel." }
];

// Entrada por CSS (tailwindcss-animate): determinista, sin mismatch de hydration.
const reveal = "animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-700 motion-reduce:animate-none";

export function MarketingLanding() {
  return (
    <div data-ct className="relative min-h-screen overflow-hidden bg-background font-sans text-foreground antialiased">
      {/* atmosfera: un solo resplandor azul muy sutil detras del producto */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute right-[-8%] top-[-6%] h-[560px] w-[620px] rounded-full bg-primary/10 blur-[130px]" />
      </div>

      <SiteHeader />

      {/* hero asimetrico: mensaje a la izquierda, producto real a la derecha */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-24 md:pt-28 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <span
            className={`inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground ${reveal}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Reservas para negocios de servicios
          </span>

          <h1
            className={`mt-6 max-w-xl text-balance pb-1 font-serif text-5xl font-medium leading-[1.05] tracking-tight md:text-6xl ${reveal}`}
            style={{ animationDelay: "80ms" }}
          >
            La agenda de tu negocio, <em className="italic text-primary">siempre abierta</em>.
          </h1>

          <p
            className={`mt-5 max-w-md text-pretty text-lg text-muted-foreground ${reveal}`}
            style={{ animationDelay: "160ms" }}
          >
            Tus clientes eligen servicio, dia y hora en segundos. Tu administras todo desde un panel simple.
          </p>

          <div className={`mt-8 flex flex-wrap items-center gap-3 ${reveal}`} style={{ animationDelay: "240ms" }}>
            <Button asChild size="lg">
              <Link href="/register">
                Crear cuenta gratis
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/track">Seguir una reserva</Link>
            </Button>
          </div>

          <p className={`mt-5 text-sm text-muted-foreground ${reveal}`} style={{ animationDelay: "300ms" }}>
            Sin tarjeta. Configuras tu negocio y empiezas a recibir reservas hoy.
          </p>
        </div>

        {/* preview real del producto (componentes de Citari, no un screenshot) */}
        <div className={`relative ${reveal}`} style={{ animationDelay: "200ms" }}>
          <div className="rounded-2xl border border-border bg-card p-2 shadow-lift">
            <div className="rounded-xl bg-background/70 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-ink text-ink-foreground">
                    <Store className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold leading-tight">Barberia El Colocho</p>
                    <p className="text-xs text-muted-foreground">Agenda de hoy</p>
                  </div>
                </div>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">4 citas</span>
              </div>

              <div className="space-y-2">
                {agenda.map((row) => (
                  <div key={row.time} className="flex items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-2.5">
                    <span className="w-12 font-mono text-xs text-muted-foreground">{row.time}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.service}</p>
                    </div>
                    <span
                      className={
                        row.tone === "confirmada"
                          ? "rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                          : "rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                      }
                    >
                      {row.tone === "confirmada" ? "Confirmada" : "Pendiente"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* chip flotante: nueva reserva entrante */}
          <div className="absolute -bottom-5 -left-4 flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-lift">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Check className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-semibold leading-tight">Nueva reserva</p>
              <p className="text-[11px] text-muted-foreground">Camila Vargas, 3:00 PM</p>
            </div>
          </div>
        </div>
      </section>

      {/* franja de sectores */}
      <section id="sectores" className="mx-auto max-w-6xl px-6 py-14 text-center">
        <p className="text-sm text-muted-foreground">Pensado para negocios que trabajan con cita</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-7 gap-y-2">
          {sectors.map((sector) => (
            <span key={sector} className="font-serif text-lg text-foreground/60">{sector}</span>
          ))}
        </div>
      </section>

      {/* como funciona: 3 pasos sin cajas */}
      <section id="producto" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="max-w-lg font-serif text-3xl font-medium tracking-tight md:text-4xl">
          De cero a recibir reservas en tres pasos.
        </h2>
        <div className="mt-10 grid gap-10 md:grid-cols-3">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.title}>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">0{i + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* cierre / cta */}
      <section id="reservar" className="mx-auto max-w-6xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-2xl bg-ink px-8 py-14 text-center text-ink-foreground md:py-16">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-full h-[280px] w-[560px] -translate-x-1/2 rounded-full bg-primary/40 blur-[110px]" />
          </div>
          <h2 className="relative mx-auto max-w-xl font-serif text-3xl font-medium tracking-tight md:text-4xl">
            Tu proximo cliente ya quiere reservar.
          </h2>
          <p className="relative mx-auto mt-3 max-w-md text-ink-foreground/70">
            Crea tu negocio, publica tu pagina y empieza a llenar tu agenda.
          </p>
          <div className="relative mt-7 flex items-center justify-center gap-3">
            <Button asChild size="lg" variant="brand">
              <Link href="/register">
                Empezar gratis
                <ArrowRight />
              </Link>
            </Button>
            <Clock3 className="hidden h-4 w-4 text-ink-foreground/50 sm:block" />
            <span className="hidden text-sm text-ink-foreground/60 sm:block">Listo en minutos</span>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
