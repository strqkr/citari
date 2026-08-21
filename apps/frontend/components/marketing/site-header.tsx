"use client";

import Link from "next/link";
import { useState } from "react";
import { useMotionValueEvent, useScroll } from "framer-motion";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/#producto", label: "Producto" },
  { href: "/#sectores", label: "Sectores" },
  { href: "/track", label: "Seguimiento" }
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 16));

  return (
    <header className="sticky top-4 z-50 px-4 duration-500 animate-in fade-in slide-in-from-top-2">
      <div
        className={`mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 rounded-full border pl-6 pr-2.5 transition-[background-color,border-color,box-shadow] duration-300 ${
          scrolled
            ? "border-border/70 bg-background/85 shadow-lift backdrop-blur-md supports-[backdrop-filter]:bg-background/75"
            : "border-border/50 bg-background/55 shadow-soft backdrop-blur"
        }`}
      >
        <Link href="/" className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Citari
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex" aria-label="Principal">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/login">Ingresar</Link>
          </Button>
          <Button asChild variant="ink" size="sm">
            <Link href="/register">Crear cuenta</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
