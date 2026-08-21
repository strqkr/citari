"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

// shadcn/ui new-york sobre react-day-picker v10 (que ya no trae CSS propio:
// toda la estructura se estiliza aqui via classNames).
function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={es}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "relative flex flex-col gap-4 sm:flex-row",
        month: "flex flex-col gap-4",
        month_caption: "relative flex h-9 items-center justify-center",
        caption_label: "text-sm font-medium capitalize",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 bg-transparent p-0 text-muted-foreground hover:text-foreground"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 bg-transparent p-0 text-muted-foreground hover:text-foreground"
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-[0.8rem] font-normal capitalize text-muted-foreground",
        week: "mt-1 flex w-full",
        day: "size-9 p-0 text-center text-sm",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "relative size-9 rounded-md p-0 font-normal aria-selected:opacity-100"
        ),
        selected:
          "[&>button]:!bg-ink [&>button]:!text-ink-foreground [&>button:hover]:!bg-ink [&>button:hover]:!text-ink-foreground",
        today: "[&>button]:font-semibold",
        outside: "text-muted-foreground/40",
        disabled: "text-muted-foreground/30 opacity-50",
        hidden: "invisible",
        ...classNames
      }}
      components={{
        Chevron: ({ orientation, className: cx, ...rest }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className={cn("size-4", cx)} {...rest} />;
        }
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

// Marca los dias con cupo con un puntito discreto bajo el numero (patron
// "calendario con eventos"), en vez de rellenar la celda. En el dia
// seleccionado (fondo tinta) el punto se vuelve claro para que se vea.
export const dayWithSlotsClass =
  "[&>button]:after:absolute [&>button]:after:bottom-1 [&>button]:after:left-1/2 [&>button]:after:h-1 [&>button]:after:w-1 [&>button]:after:-translate-x-1/2 [&>button]:after:rounded-full [&>button]:after:bg-primary [&>button]:after:content-[''] [&>button[aria-selected=true]]:after:bg-ink-foreground";

export { Calendar };
