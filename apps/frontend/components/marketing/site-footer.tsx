import Link from "next/link";

const groups: { title: string; items: { href: string; label: string }[] }[] = [
  {
    title: "Producto",
    items: [
      { href: "/#producto", label: "Reservas" },
      { href: "/#sectores", label: "Sectores" },
      { href: "/track", label: "Seguimiento" }
    ]
  },
  {
    title: "Cuenta",
    items: [
      { href: "/login", label: "Ingresar" },
      { href: "/register", label: "Crear cuenta" },
      { href: "/admin/login", label: "Acceso interno" }
    ]
  },
  {
    title: "Reservar",
    items: [
      { href: "/track", label: "Consultar codigo" },
      { href: "/#reservar", label: "Empezar" }
    ]
  }
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="font-serif text-2xl font-semibold tracking-tight text-foreground">
              Citari
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Reservas para negocios de servicios: agenda, disponibilidad y seguimiento en un solo
              lugar.
            </p>
          </div>

          {groups.map((group) => (
            <div key={group.title}>
              <p className="text-xs font-semibold uppercase tracking-widest text-foreground/70">
                {group.title}
              </p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="text-muted-foreground transition-colors hover:text-foreground">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground md:flex-row">
          <span>
            <span aria-hidden>&copy;</span> {year} Citari
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Reservas para negocios de servicios
          </span>
        </div>
      </div>
    </footer>
  );
}
