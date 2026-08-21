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
import { selectClass, textareaClass } from "@/components/ui/page-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ErrorBanner, ManagerHeader } from "@/components/admin/manager-ui";
import { apiDelete, apiPatch, apiPost, isMockMode } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { errMessage, useResource } from "@/lib/resource";

type Category = { categoryId: number; name: string; description: string | null; isActive: boolean };

const initialCategories: Category[] = [
  { categoryId: 1, name: "Odontologia general", description: "Consultas, limpiezas y controles preventivos.", isActive: true },
  { categoryId: 2, name: "Estetica dental", description: "Blanqueamientos y procedimientos esteticos.", isActive: true },
  { categoryId: 3, name: "Ortodoncia", description: "Valoraciones y controles de tratamiento.", isActive: false }
];

export function CategoriesManager() {
  const { items: categories, setItems: setCategories, loading, error, setError, reload } = useResource<Category>(
    endpoints.serviceCategories.list,
    initialCategories
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveCategory() {
    if (!name.trim()) return;
    setError(null);
    if (isMockMode()) {
      if (editingId) {
        setCategories((current) => current.map((c) => (c.categoryId === editingId ? { ...c, name, description, isActive } : c)));
      } else {
        setCategories((current) => [...current, { categoryId: Date.now(), name, description, isActive }]);
      }
      resetForm();
      setIsModalOpen(false);
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        const updated = await apiPatch<Category>(endpoints.serviceCategories.byId(editingId), { name, description, isActive });
        setCategories((current) => current.map((c) => (c.categoryId === editingId ? updated : c)));
      } else {
        const created = await apiPost<Category>(endpoints.serviceCategories.list, { name, description });
        setCategories((current) => [...current, created]);
      }
      resetForm();
      setIsModalOpen(false);
    } catch (err) {
      setError(errMessage(err, "No se pudo guardar la categoria."));
    } finally {
      setBusy(false);
    }
  }

  function editCategory(category: Category) {
    setEditingId(category.categoryId);
    setName(category.name);
    setDescription(category.description ?? "");
    setIsActive(category.isActive);
    setIsModalOpen(true);
  }

  async function toggleCategory(category: Category) {
    const next = !category.isActive;
    if (isMockMode()) {
      setCategories((current) => current.map((c) => (c.categoryId === category.categoryId ? { ...c, isActive: next } : c)));
      return;
    }
    setError(null);
    try {
      const updated = await apiPatch<Category>(endpoints.serviceCategories.byId(category.categoryId), { isActive: next });
      setCategories((current) => current.map((c) => (c.categoryId === category.categoryId ? updated : c)));
    } catch (err) {
      setError(errMessage(err, "No se pudo cambiar el estado."));
    }
  }

  async function deleteCategory(category: Category) {
    if (isMockMode()) {
      setCategories((current) => current.filter((c) => c.categoryId !== category.categoryId));
      return;
    }
    setError(null);
    try {
      await apiDelete(endpoints.serviceCategories.byId(category.categoryId));
      setCategories((current) => current.filter((c) => c.categoryId !== category.categoryId));
    } catch (err) {
      setError(errMessage(err, "No se pudo eliminar la categoria."));
    }
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setDescription("");
    setIsActive(true);
  }

  function openCreateModal() {
    resetForm();
    setIsModalOpen(true);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ManagerHeader
        title="Categorias de servicios"
        subtitle="Organiza los servicios que el negocio muestra en su pagina de reservas."
        action={<Button onClick={openCreateModal}><Plus />Agregar categoria</Button>}
      />

      {error ? <ErrorBanner message={error} onRetry={reload} /> : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Nombre</TableHead>
                <TableHead>Descripcion</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="pr-6 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="pl-6"><Skeleton className="h-4 w-36" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-md" /></TableCell>
                    <TableCell className="pr-6"><Skeleton className="ml-auto h-8 w-8 rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : categories.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">Aun no hay categorias. Crea la primera.</TableCell>
                </TableRow>
              ) : (
                categories.map((category) => (
                  <TableRow key={category.categoryId}>
                    <TableCell className="pl-6 font-medium">{category.name}</TableCell>
                    <TableCell className="text-muted-foreground">{category.description}</TableCell>
                    <TableCell>
                      <Badge variant={category.isActive ? "success" : "muted"}>{category.isActive ? "Activa" : "Inactiva"}</Badge>
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal /><span className="sr-only">Acciones</span></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => editCategory(category)}><Pencil />Editar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleCategory(category)}><Power />{category.isActive ? "Inactivar" : "Activar"}</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => deleteCategory(category)} className="text-destructive focus:text-destructive"><Trash2 />Eliminar</DropdownMenuItem>
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

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Editar categoria" : "Crear categoria"}>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-name">Nombre</Label>
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-desc">Descripcion</Label>
            <textarea id="cat-desc" className={textareaClass} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {editingId ? (
            <div className="space-y-2">
              <Label htmlFor="cat-state">Estado</Label>
              <select id="cat-state" className={selectClass} value={isActive ? "active" : "inactive"} onChange={(e) => setIsActive(e.target.value === "active")}>
                <option value="active">Activa</option>
                <option value="inactive">Inactiva</option>
              </select>
            </div>
          ) : null}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveCategory} disabled={busy}>{busy ? "Guardando..." : editingId ? "Guardar" : "Agregar"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
