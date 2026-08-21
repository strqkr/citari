"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner, ManagerHeader } from "@/components/admin/manager-ui";
import { apiPost, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { errMessage, useResource } from "@/lib/resource";
import type { Customer } from "@/types/customer";

const initialCustomers: Customer[] = [
  { customerId: 1, firstName: "Sofia", lastName: "Campos", email: "sofia@email.com", phone: "8787-1010" },
  { customerId: 2, firstName: "Marco", lastName: "Arias", email: "marco@email.com", phone: "8686-1212" },
  { customerId: 3, firstName: "Daniela", lastName: "Rojas", email: "daniela@email.com", phone: "8585-3434" }
];

const emptyForm = { firstName: "", lastName: "", email: "", phone: "", notes: "" };

function initials(c: Customer) {
  return `${c.firstName[0] ?? ""}${c.lastName[0] ?? ""}`.toUpperCase();
}

export function CustomersManager() {
  const { items: customers, setItems: setCustomers, loading, error, setError, reload } = useResource<Customer>(
    endpoints.customers.list,
    initialCustomers
  );
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const term = search.toLowerCase();
  const filtered = customers.filter((c) => `${c.firstName} ${c.lastName} ${c.email} ${c.phone}`.toLowerCase().includes(term));

  async function saveCustomer() {
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    setError(null);
    if (isMockMode()) {
      setCustomers((current) => [...current, { customerId: Date.now(), ...form }]);
      setForm(emptyForm);
      setIsModalOpen(false);
      return;
    }
    setBusy(true);
    try {
      const created = await apiPost<Customer>(endpoints.customers.list, form);
      setCustomers((current) => [...current, created]);
      setForm(emptyForm);
      setIsModalOpen(false);
    } catch (err) {
      setError(errMessage(err, "No se pudo registrar el cliente."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ManagerHeader
        title="Clientes"
        subtitle="Personas que han reservado en tu negocio."
        action={<Button onClick={() => { setForm(emptyForm); setIsModalOpen(true); }}><Plus />Agregar cliente</Button>}
      />

      {error ? <ErrorBanner message={error} onRetry={reload} /> : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border py-4">
          <p className="text-sm font-medium">{filtered.length} cliente(s)</p>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente" className="h-9 w-56" />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Nombre</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Telefono</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="pl-6"><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-44" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={3} className="py-12 text-center text-muted-foreground">No hay clientes que coincidan.</TableCell>
                </TableRow>
              ) : (
                filtered.map((customer) => (
                  <TableRow key={customer.customerId}>
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8"><AvatarFallback>{initials(customer)}</AvatarFallback></Avatar>
                        <span className="font-medium">{customer.firstName} {customer.lastName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{customer.email}</TableCell>
                    <TableCell className="text-muted-foreground">{customer.phone}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title="Nuevo cliente">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cus-first">Nombre</Label>
              <Input id="cus-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cus-last">Apellido</Label>
              <Input id="cus-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cus-email">Correo electronico</Label>
            <Input id="cus-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cus-phone">Telefono</Label>
            <Input id="cus-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveCustomer} disabled={busy}>{busy ? "Guardando..." : "Agregar"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
