"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarCheck,
  CalendarRange,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  MapPin,
  Scissors,
  Settings,
  Store,
  Tags,
  Users
} from "lucide-react";
import { apiGet, clearAuthToken, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { useAuth, userInitials } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "General",
    items: [
      { href: "/dashboard", label: "Resumen", icon: LayoutDashboard },
      { href: "/bookings", label: "Reservas", icon: CalendarCheck },
      { href: "/customers", label: "Clientes", icon: Users },
      { href: "/reports", label: "Reportes", icon: BarChart3 }
    ]
  },
  {
    label: "Negocio",
    items: [
      { href: "/services", label: "Servicios", icon: Scissors },
      { href: "/service-categories", label: "Categorias", icon: Tags },
      { href: "/locations", label: "Sedes", icon: MapPin },
      { href: "/availability", label: "Disponibilidad", icon: CalendarRange },
      { href: "/settings/business", label: "Configuracion", icon: Settings }
    ]
  }
];

type CurrentTenant = { tenantId: number; slug: string; name: string; status: string };

const MOCK_TENANT: CurrentTenant = {
  tenantId: 1,
  slug: "barberia-el-colocho",
  name: "Negocio demo",
  status: "activo"
};

function pageTitle(pathname: string): string {
  for (const group of navGroups) {
    const item = group.items.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
    if (item) return item.label;
  }
  return "Panel";
}

export function PrivateShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [tenant, setTenant] = useState<CurrentTenant | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    let active = true;
    if (isMockMode()) {
      setTenant(MOCK_TENANT);
      return;
    }
    if (!user) return;
    apiGet<CurrentTenant>(endpoints.tenant.current)
      .then((current) => active && setTenant(current))
      .catch(() => active && setTenant(null));
    return () => {
      active = false;
    };
  }, [user]);

  if (loading || !user) {
    return (
      <div data-ct className="flex min-h-svh items-center justify-center bg-background font-sans text-muted-foreground">
        Cargando tu panel...
      </div>
    );
  }

  return (
    <div data-ct className="font-sans text-foreground antialiased">
      <SidebarProvider>
        <AppSidebar tenant={tenant} />
        <SidebarInset>
          <Topbar user={user} tenant={tenant} onLogout={() => { clearAuthToken(); router.push("/login"); }} />
          <div className="flex-1 overflow-y-auto bg-background p-4 md:p-8">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

function AppSidebar({ tenant }: { tenant: CurrentTenant | null }) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/dashboard" className="flex h-10 items-center gap-2.5 px-1.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink text-ink-foreground">
            <Store className="h-4 w-4" />
          </span>
          {!collapsed ? <span className="font-serif text-lg font-semibold tracking-tight text-sidebar-foreground">Citari</span> : null}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <Link href={item.href}>
                        <Icon />
                        {!collapsed ? <span>{item.label}</span> : null}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        {!collapsed ? (
          <div className="rounded-lg bg-sidebar-accent/60 p-3">
            <Badge variant="brand" className="gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {tenant?.status === "activo" || !tenant ? "Negocio activo" : tenant.status}
            </Badge>
            <p className="mt-2 truncate text-xs text-sidebar-foreground/70">{tenant?.name ?? "Panel del negocio"}</p>
          </div>
        ) : (
          <span className="mx-auto h-2 w-2 rounded-full bg-primary" title="Negocio activo" />
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

function Topbar({
  user,
  tenant,
  onLogout
}: {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  tenant: CurrentTenant | null;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  const tenantName = tenant?.name ?? "Panel del negocio";

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-6" />
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold leading-tight">{pageTitle(pathname)}</h1>
        <p className="truncate text-xs text-muted-foreground">{tenantName}</p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {tenant?.slug ? (
          <Link
            href={`/book/${tenant.slug}`}
            className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Pagina publica
          </Link>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar>
              <AvatarFallback className="bg-ink text-ink-foreground">{userInitials(user)}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-semibold">{fullName}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/business">
                <Settings />
                Configuracion del negocio
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
              <LogOut />
              Cerrar sesion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
