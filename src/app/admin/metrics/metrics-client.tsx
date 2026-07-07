"use client";

import { useState, useTransition } from "react";
import type { AdminTenant, ProjectMetric } from "@/server/admin-api";
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
import { updateMetricsAction, getProjectsForTenant, getMetricsForProject } from "./actions";

interface MetricsClientProps {
  tenants: AdminTenant[];
  projects: Array<{ id: string; name: string }>;
  metrics: ProjectMetric[];
  defaultTenantId: string;
  defaultProjectId: string;
}

export function MetricsClient({
  tenants,
  projects: initialProjects,
  metrics: initialMetrics,
  defaultTenantId,
  defaultProjectId,
}: MetricsClientProps) {
  const [isPending, startTransition] = useTransition();
  const [selectedTenant, setSelectedTenant] = useState<string>(defaultTenantId || tenants[0]?.id || "");
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>(initialProjects);
  const [selectedProject, setSelectedProject] = useState<string>(defaultProjectId);
  const [metrics, setMetrics] = useState<ProjectMetric[]>(initialMetrics);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleTenantChange = async (tenantId: string) => {
    setSelectedTenant(tenantId);
    setProjects([]);
    setSelectedProject("");
    setMetrics([]);

    try {
      const loadedProjects = await getProjectsForTenant(tenantId);
      setProjects(loadedProjects);
      if (loadedProjects.length > 0) {
        setSelectedProject(loadedProjects[0].id);
        const loadedMetrics = await getMetricsForProject(loadedProjects[0].id);
        setMetrics(loadedMetrics);
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
      const loadedMetrics = await getMetricsForProject(projectId);
      setMetrics(loadedMetrics);
    } catch (error) {
      setMessage({
        type: "error",
        text: `Failed to load metrics: ${(error as Error).message}`,
      });
      setMetrics([]);
    }
  };

  const handleValueChange = (key: string, rawValue: string) => {
    setMetrics((prev) =>
      prev.map((m) =>
        m.key === key ? { ...m, value: rawValue === "" ? 0 : parseFloat(rawValue) } : m
      )
    );
  };

  const handleLabelChange = (key: string, label: string) => {
    setMetrics((prev) =>
      prev.map((m) => (m.key === key ? { ...m, label } : m))
    );
  };

  const handleSave = async () => {
    if (!selectedProject) return;

    startTransition(async () => {
      setMessage(null);
      try {
        await updateMetricsAction(selectedProject, metrics);
        setMessage({
          type: "success",
          text: "Metric targets updated successfully",
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
          <h1 className="text-2xl font-semibold tracking-tight">Metric Targets</h1>
          <p className="text-sm text-muted-foreground">
            Edit target values and labels for project metrics.
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
          Select a tenant and project to configure metric targets
        </div>
      ) : metrics.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No metrics configured for this project
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm" style={{ minWidth: "700px" }}>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                <th className="py-3 px-4">Key</th>
                <th className="py-3 px-4">Label</th>
                <th className="py-3 px-4">Target Value</th>
                <th className="py-3 px-4">Unit</th>
                <th className="py-3 px-4">Category</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => (
                <tr key={metric.key} className="border-b last:border-b-0">
                  <td className="py-3 px-4 font-mono text-xs">{metric.key}</td>
                  <td className="py-3 px-4">
                    <Input
                      value={metric.label}
                      onChange={(e) => handleLabelChange(metric.key, e.target.value)}
                      className="max-w-xs"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <Input
                      type="number"
                      value={metric.value}
                      onChange={(e) => handleValueChange(metric.key, e.target.value)}
                      className="max-w-[120px]"
                    />
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{metric.unit ?? "—"}</td>
                  <td className="py-3 px-4 text-muted-foreground">{metric.category ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
