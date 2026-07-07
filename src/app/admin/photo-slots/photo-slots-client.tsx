"use client";

import { useState, useTransition } from "react";
import type { AdminTenant, PhotoSlotLabel } from "@/server/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updatePhotoSlotsAction, getProjectsForTenant, getPhotoSlotsForProject } from "./actions";

interface PhotoSlotsClientProps {
  tenants: AdminTenant[];
  projects: Array<{ id: string; name: string }>;
  photoSlots: PhotoSlotLabel[];
  defaultTenantId: string;
  defaultProjectId: string;
}

export function PhotoSlotsClient({
  tenants,
  projects: initialProjects,
  photoSlots: initialPhotoSlots,
  defaultTenantId,
  defaultProjectId,
}: PhotoSlotsClientProps) {
  const [isPending, startTransition] = useTransition();
  const [selectedTenant, setSelectedTenant] = useState<string>(defaultTenantId || tenants[0]?.id || "");
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>(
    initialProjects
  );
  const [selectedProject, setSelectedProject] = useState<string>(defaultProjectId);
  const [photoSlots, setPhotoSlots] = useState<PhotoSlotLabel[]>(initialPhotoSlots);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleTenantChange = async (tenantId: string) => {
    setSelectedTenant(tenantId);
    setProjects([]);
    setSelectedProject("");
    setPhotoSlots([]);

    try {
      const loadedProjects = await getProjectsForTenant(tenantId);
      setProjects(loadedProjects);
      if (loadedProjects.length > 0) {
        setSelectedProject(loadedProjects[0].id);
        const loadedSlots = await getPhotoSlotsForProject(loadedProjects[0].id);
        setPhotoSlots(loadedSlots);
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: `Failed to load projects: ${(error as Error).message}`,
      });
    }
  };

  const handleProjectChange = async (projectId: string) => {
    setSelectedProject(projectId);
    try {
      const loadedSlots = await getPhotoSlotsForProject(projectId);
      setPhotoSlots(loadedSlots);
    } catch (error) {
      setMessage({
        type: "error",
        text: `Failed to load photo slots: ${(error as Error).message}`,
      });
      setPhotoSlots([]);
    }
  };

  const handleSlotChange = (kind: string, label: string) => {
    setPhotoSlots((prev) =>
      prev.map((slot) => (slot.kind === kind ? { ...slot, label } : slot))
    );
  };

  const handleSave = async () => {
    if (!selectedProject) return;

    startTransition(async () => {
      setMessage(null);
      try {
        await updatePhotoSlotsAction(selectedProject, photoSlots);
        setMessage({
          type: "success",
          text: "Photo slot labels updated successfully",
        });
      } catch (error) {
        setMessage({
          type: "error",
          text: `Failed to update: ${(error as Error).message}`,
        });
      }
    });
  };

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Photo Slot Labels</h1>
          <p className="text-sm text-muted-foreground">
            Configure custom labels for photo slots.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={isPending || !selectedProject}
          >
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-md text-sm ${
            message.type === "success"
              ? "bg-success/10 text-success"
              : "bg-danger/10 text-danger"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Tenant</Label>
          <Select value={selectedTenant} onValueChange={handleTenantChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select tenant" />
            </SelectTrigger>
            <SelectContent>
              {tenants.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Project</Label>
          <Select
            value={selectedProject}
            onValueChange={handleProjectChange}
            disabled={!selectedTenant || projects.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedProject ? (
        <div className="text-sm text-muted-foreground">
          Select a tenant and project to configure photo slots
        </div>
      ) : photoSlots.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No photo slots configured for this project
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm" style={{ minWidth: "500px" }}>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                <th className="py-3 px-4">Slot Kind</th>
                <th className="py-3 px-4">Label</th>
              </tr>
            </thead>
            <tbody>
              {photoSlots.map((slot) => (
                <tr key={slot.kind} className="border-b last:border-b-0">
                  <td className="py-3 px-4 font-mono text-xs">{slot.kind}</td>
                  <td className="py-3 px-4">
                    <Input
                      value={slot.label}
                      onChange={(e) =>
                        handleSlotChange(slot.kind, e.target.value)
                      }
                      className="max-w-md"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
