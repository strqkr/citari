"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { selectClass, textareaClass } from "@/components/ui/page-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ErrorBanner, ManagerHeader } from "@/components/admin/manager-ui";
import { apiDelete, apiPatch, apiPost } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { errMessage, useResource } from "@/lib/resource";
import type { Service, ServiceCategory } from "@/types/service";

type Category = ServiceCategory;
type ServiceRow = Service;

const emptyForm = { name: "", description: "", durationMinutes: 30, price: 0, showPrice: true, categoryId: "" };
type ServiceForm = typeof emptyForm;

export function ServicesManager() {
  const { items: services, setItems: setServices, loading, error, setError, reload } = useResource<ServiceRow>(endpoints.services.list);
  const { items: categories } = useResource<Category>(endpoints.serviceCategories.list);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = services.filter((service) => service.name.toLowerCase().includes(search.toLowerCase()));
  const isEditing = editingId !== null;

  function categoryName(id?: string): string {
    if (!id) return "—";
    return categories.find((c) => c.id === id)?.name ?? "—";
  }

  async function saveService() {
    if (!form.name.trim()) return;
    if (!form.categoryId) {
      setError("Selecciona una categoria para el servicio.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const body = {
        categoryId: form.categoryId,
        name: form.name,
        description: form.description || null,
        durationMinutes: form.durationMinutes,
        price: form.showPrice ? form.price : null,
        showPrice: form.showPrice,
        currency: "CRC"
      };
      if (editingId) {
        const updated = await apiPatch<Service>(endpoints.services.byId(editingId), body);
        setServices((current) => current.map((s) => (s.id === editingId ? updated : s)));
      } else {
        const created = await apiPost<Service>(endpoints.services.list, body);
        setServices((current) => [...current, created]);
      }
      closeModal();
    } catch (err) {
      setError(errMessage(err, "No se pudo guardar el servicio."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteService(service: ServiceRow) {
    setError(null);
    try {
      await apiDelete(endpoints.services.byId(service.id));
      setServices((current) => current.filter((s) => s.id !== service.id));
    } catch (err) {
      setError(errMessage(err, "No se pudo eliminar el servicio."));
    }
  }

  function editService(service: ServiceRow) {
    setEditingId(service.id);
    setForm({
      name: service.name,
      description: service.description ?? "",
      durationMinutes: service.durationMinutes,
      price: Number(service.price ?? 0),
      showPrice: service.showPrice,
      categoryId: service.categoryId
    });
    setIsModalOpen(true);
  }

  function openCreateModal() {
    setEditingId(null);
    setForm({ ...emptyForm, categoryId: categories[0]?.id ?? "" });
    setIsModalOpen(true);
  }

  function closeModal() {
    setForm(emptyForm);
    setEditingId(null);
    setIsModalOpen(false);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ManagerHeader
        title="Servicios"
        subtitle="Administra los servicios que tus clientes pueden reservar."
        action={<Button onClick={openCreateModal}><Plus />Agregar servicio</Button>}
      />

      {error ? <ErrorBanner message={error} onRetry={reload} /> : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border py-4">
          <p className="text-sm font-medium">{filtered.length} servicio(s)</p>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar servicio" className="h-9 w-56" />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Nombre</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Duracion</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead className="pr-6 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="pl-6"><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell className="pr-6"><Skeleton className="ml-auto h-8 w-8 rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">No hay servicios que coincidan.</TableCell>
                </TableRow>
              ) : (
                filtered.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell className="pl-6">
                      <span className="block font-medium">{service.name}</span>
                      <span className="text-xs text-muted-foreground">{service.description}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{service.category?.name ?? categoryName(service.categoryId)}</TableCell>
                    <TableCell className="text-muted-foreground">{service.durationMinutes} min</TableCell>
                    <TableCell className="text-muted-foreground">{service.showPrice && service.price ? `CRC ${service.price}` : "No visible"}</TableCell>
                    <TableCell className="pr-6 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal /><span className="sr-only">Acciones</span></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => editService(service)}><Pencil />Editar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => deleteService(service)} className="text-destructive focus:text-destructive"><Trash2 />Eliminar</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title={isEditing ? "Editar servicio" : "Crear servicio"}>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="svc-name">Nombre</Label>
            <Input id="svc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="svc-cat">Categoria</Label>
            <select id="svc-cat" className={selectClass} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="" disabled>Selecciona una categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="svc-desc">Descripcion</Label>
            <textarea id="svc-desc" className={textareaClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="svc-dur">Duracion</Label>
              <select id="svc-dur" className={selectClass} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}>
                {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="svc-price">Precio informativo</Label>
              <Input id="svc-price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="svc-show">Mostrar precio</Label>
            <select id="svc-show" className={selectClass} value={form.showPrice ? "yes" : "no"} onChange={(e) => setForm({ ...form, showPrice: e.target.value === "yes" })}>
              <option value="yes">Si</option>
              <option value="no">No</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveService} disabled={busy}>{busy ? "Guardando..." : isEditing ? "Guardar" : "Agregar"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
