"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { selectClass } from "@/components/ui/page-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ErrorBanner, ManagerHeader } from "@/components/admin/manager-ui";
import { apiDelete, apiPatch, apiPost } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { errMessage, useResource } from "@/lib/resource";

type Location = {
  id: string;
  name: string;
  province: string;
  canton: string;
  district: string;
  postalCode: string;
  isMain: boolean;
  isActive: boolean;
};

const emptyForm = { name: "", province: "", canton: "", district: "", postalCode: "", phone: "", isMain: false, isActive: true };
type LocationForm = typeof emptyForm;

export function LocationsManager() {
  const { items: locations, setItems: setLocations, loading, error, setError, reload } = useResource<Location>(endpoints.locations.list);
  const [form, setForm] = useState<LocationForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isEditing = editingId !== null;

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  }

  function editLocation(location: Location) {
    setEditingId(location.id);
    setForm({
      name: location.name,
      province: location.province,
      canton: location.canton,
      district: location.district,
      postalCode: location.postalCode,
      phone: "",
      isMain: location.isMain,
      isActive: location.isActive
    });
    setIsModalOpen(true);
  }

  async function saveLocation() {
    if (!form.name.trim() || !form.province.trim() || !form.canton.trim() || !form.district.trim() || !form.postalCode.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const body = {
        name: form.name,
        province: form.province,
        canton: form.canton,
        district: form.district,
        postalCode: form.postalCode,
        isMain: form.isMain
      };
      if (editingId) {
        const updated = await apiPatch<Location>(endpoints.locations.byId(editingId), { ...body, isActive: form.isActive });
        setLocations((current) => current.map((l) => (l.id === editingId ? updated : l)));
      } else {
        const created = await apiPost<Location>(endpoints.locations.list, body);
        setLocations((current) => [...current, created]);
      }
      setIsModalOpen(false);
    } catch (err) {
      setError(errMessage(err, "No se pudo guardar la sede."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleLocation(location: Location) {
    const next = !location.isActive;
    setError(null);
    try {
      const updated = await apiPatch<Location>(endpoints.locations.byId(location.id), { isActive: next });
      setLocations((current) => current.map((l) => (l.id === location.id ? updated : l)));
    } catch (err) {
      setError(errMessage(err, "No se pudo cambiar el estado."));
    }
  }

  async function deleteLocation(location: Location) {
    setError(null);
    try {
      await apiDelete(endpoints.locations.byId(location.id));
      setLocations((current) => current.filter((l) => l.id !== location.id));
    } catch (err) {
      setError(errMessage(err, "No se pudo eliminar la sede."));
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ManagerHeader
        title="Sedes"
        subtitle="Ubicaciones donde tu negocio atiende reservas."
        action={<Button onClick={openCreate}><Plus />Agregar sede</Button>}
      />

      {error ? <ErrorBanner message={error} onRetry={reload} /> : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Nombre</TableHead>
                <TableHead>Direccion</TableHead>
                <TableHead>Codigo postal</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="pr-6 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="pl-6"><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-md" /></TableCell>
                    <TableCell className="pr-6"><Skeleton className="ml-auto h-8 w-8 rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : locations.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">Aun no hay sedes. Crea la primera.</TableCell>
                </TableRow>
              ) : (
                locations.map((location) => (
                  <TableRow key={location.id}>
                    <TableCell className="pl-6 font-medium">{location.name}</TableCell>
                    <TableCell className="text-muted-foreground">{`${location.district}, ${location.canton}, ${location.province}`}</TableCell>
                    <TableCell className="text-muted-foreground">{location.postalCode}</TableCell>
                    <TableCell>
                      {location.isMain ? <Badge variant="brand">Principal</Badge> : <Badge variant="muted">Secundaria</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={location.isActive ? "success" : "muted"}>{location.isActive ? "Activa" : "Inactiva"}</Badge>
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal /><span className="sr-only">Acciones</span></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => editLocation(location)}><Pencil />Editar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleLocation(location)}><Power />{location.isActive ? "Inactivar" : "Activar"}</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => deleteLocation(location)} className="text-destructive focus:text-destructive"><Trash2 />Eliminar</DropdownMenuItem>
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

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title={isEditing ? "Editar sede" : "Crear sede"}>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="loc-name">Nombre</Label>
            <Input id="loc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="loc-province">Provincia</Label>
              <Input id="loc-province" value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loc-canton">Canton</Label>
              <Input id="loc-canton" value={form.canton} onChange={(e) => setForm({ ...form, canton: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="loc-district">Distrito</Label>
              <Input id="loc-district" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loc-cp">Codigo postal</Label>
              <Input id="loc-cp" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="loc-phone">Telefono</Label>
              <Input id="loc-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loc-main">Tipo</Label>
              <select id="loc-main" className={selectClass} value={form.isMain ? "main" : "secondary"} onChange={(e) => setForm({ ...form, isMain: e.target.value === "main" })}>
                <option value="main">Principal</option>
                <option value="secondary">Secundaria</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveLocation} disabled={busy}>{busy ? "Guardando..." : isEditing ? "Guardar" : "Agregar"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
