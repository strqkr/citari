"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { LayoutDashboard, LogOut, ShieldCheck, Store } from "lucide-react";
import { clearAuthToken, isMockMode } from "@/lib/api";
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

const navItems = [{ href: "/admin/tenants", label: "Negocios", icon: Store }];

function pageTitle(pathname: string): string {
  if (pathname.startsWith("/admin/tenants")) return "Negocios";
  return "Panel interno";
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (isMockMode()) return;
    if (!user || user.role !== "superadmin") router.replace("/admin/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div data-ct className="flex min-h-svh items-center justify-center bg-background font-sans text-muted-foreground">
        Cargando...
      </div>
    );
  }

  return (
    <div data-ct className="font-sans text-foreground antialiased">
      <SidebarProvider>
        <AdminSidebar />
        <SidebarInset>
          <AdminTopbar user={user} onLogout={() => { clearAuthToken(); router.push("/admin/login"); }} />
          <div className="flex-1 overflow-y-auto bg-background p-4 md:p-8">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

function AdminSidebar() {
  const pathname = usePathname();
  const { collapsed } = useSidebar();

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/admin/tenants" className="flex h-10 items-center gap-2.5 px-1.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink text-ink-foreground">
            <ShieldCheck className="h-4 w-4" />
          </span>
          {!collapsed ? (
            <span className="flex flex-col leading-none">
              <span className="font-serif text-lg font-semibold tracking-tight text-sidebar-foreground">Citari</span>
              <span className="text-[0.7rem] uppercase tracking-widest text-sidebar-foreground/50">Interno</span>
            </span>
          ) : null}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
          <SidebarMenu>
            {navItems.map((item) => {
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
      </SidebarContent>

      <SidebarFooter>
        {!collapsed ? (
          <div className="rounded-lg bg-sidebar-accent/60 p-3">
            <Badge variant="brand" className="gap-1.5">
              <ShieldCheck className="h-3 w-3" />
              Superadministrador
            </Badge>
            <p className="mt-2 text-xs text-sidebar-foreground/70">Control global de la plataforma</p>
          </div>
        ) : (
          <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary" title="Superadmin">
            <ShieldCheck className="h-3.5 w-3.5" />
          </span>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

function AdminTopbar({
  user,
  onLogout
}: {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const fullName = `${user.firstName} ${user.lastName}`.trim();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-6" />
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold leading-tight">{pageTitle(pathname)}</h1>
        <p className="truncate text-xs text-muted-foreground">Panel superadmin</p>
      </div>

      <div className="ml-auto flex items-center gap-2">
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
              <Link href="/dashboard">
                <LayoutDashboard />
                Ir al panel de negocio
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
