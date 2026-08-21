import { redirect } from "next/navigation";

// La configuracion de horario se unifico con la generacion de turnos en
// /availability (un solo flujo). Se conserva la ruta como redireccion para no
// romper enlaces viejos.
export default function BusinessHoursPage() {
  redirect("/availability");
}
