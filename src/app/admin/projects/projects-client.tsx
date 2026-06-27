"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { AdminTenant, AdminProject } from "@/server/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateProjectAction } from "./actions";

interface ProjectsClientProps {
  tenants: AdminTenant[];
  projectsByTenant: Record<string, AdminProject[]>;
}

type DraftState = {
  name: string;
  client_name: string;
  start_date: string;
  end_date: string;
};

type Message = {
  type: "success" | "error";
  text: string;
  key: string; // tenantId:projectId
};

export function ProjectsClient({ tenants, projectsByTenant }: ProjectsClientProps) {
  const [isPending, startTransition] = useTransition();
  const [editingKey, setEditingKey] = useState<string | null>(null); // "tenantId:projectId"
  const [draft, setDraft] = useState<DraftState>({ name: "", client_name: "", start_date: "", end_date: "" });
  const [message, setMessage] = useState<Message | null>(null);

  // Local copy of projects so we can reflect saves without a page reload
  const [localProjects, setLocalProjects] = useState<Record<string, AdminProject[]>>(projectsByTenant);

  const makeKey = (tenantId: string, projectId: string) => `${tenantId}:${projectId}`;

  const handleEdit = (project: AdminProject) => {
    const key = makeKey(project.tenant_id, project.id);
    setEditingKey(key);
    setDraft({
      name: project.name,
      client_name: project.client_name ?? "",
      start_date: project.start_date ?? "",
      end_date: project.end_date ?? "",
    });
    setMessage(null);
  };

  const handleCancel = () => {
    setEditingKey(null);
  };

  const handleSave = (tenantId: string, projectId: string) => {
    const key = makeKey(tenantId, projectId);
    startTransition(async () => {
      setMessage(null);
      try {
        const updated = await updateProjectAction(tenantId, projectId, {
          name: draft.name.trim() || undefined,
          client_name: draft.client_name.trim() || undefined,
          start_date: draft.start_date.trim() || null,
          end_date: draft.end_date.trim() || null,
        });
        // Update local state
        setLocalProjects((prev) => ({
          ...prev,
          [tenantId]: prev[tenantId].map((p) => (p.id === projectId ? updated : p)),
        }));
        setMessage({ type: "success", text: "Project updated.", key });
        setEditingKey(null);
      } catch (err) {
        setMessage({ type: "error", text: `Failed: ${(err as Error).message}`, key });
      }
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Edit project name and active window (start / end date) per tenant.
          </p>
        </div>
        <Link href="/admin">
          <Button variant="outline">Back to Admin</Button>
        </Link>
      </div>

      {tenants.length === 0 && (
        <p className="text-sm text-muted-foreground">No tenants configured.</p>
      )}

      <div className="space-y-6">
        {tenants.map((tenant) => {
          const projects = localProjects[tenant.id] ?? [];
          return (
            <Card key={tenant.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{tenant.name}</CardTitle>
                <CardDescription className="font-mono text-xs">{tenant.id}</CardDescription>
              </CardHeader>
              <CardContent>
                {projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No projects for this tenant.</p>
                ) : (
                  <div className="space-y-4">
                    {projects.map((project) => {
                      const key = makeKey(tenant.id, project.id);
                      const isEditing = editingKey === key;
                      const projMessage = message?.key === key ? message : null;

                      return (
                        <div key={project.id} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm">{project.name}</p>
                              <p className="text-xs text-muted-foreground">{project.client_name}</p>
                              <p className="font-mono text-xs text-muted-foreground">{project.id}</p>
                            </div>
                            {!isEditing && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEdit(project)}
                              >
                                Edit
                              </Button>
                            )}
                          </div>

                          {!isEditing ? (
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-xs text-muted-foreground">Start date</span>
                                <p>{project.start_date ?? <span className="italic text-muted-foreground">not set</span>}</p>
                              </div>
                              <div>
                                <span className="text-xs text-muted-foreground">End date</span>
                                <p>{project.end_date ?? <span className="italic text-muted-foreground">not set</span>}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="space-y-1">
                                <Label htmlFor={`name-${key}`} className="text-xs text-muted-foreground">
                                  Project Name
                                </Label>
                                <Input
                                  id={`name-${key}`}
                                  value={draft.name}
                                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                                  placeholder="Project name"
                                  className="max-w-sm"
                                  autoFocus
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`client-${key}`} className="text-xs text-muted-foreground">
                                  Client Name (shown on dashboard)
                                </Label>
                                <Input
                                  id={`client-${key}`}
                                  value={draft.client_name}
                                  onChange={(e) => setDraft((d) => ({ ...d, client_name: e.target.value }))}
                                  placeholder="e.g. Brasserie Labatt"
                                  className="max-w-sm"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-3 max-w-sm">
                                <div className="space-y-1">
                                  <Label htmlFor={`start-${key}`} className="text-xs text-muted-foreground">
                                    Start Date
                                  </Label>
                                  <Input
                                    id={`start-${key}`}
                                    type="date"
                                    value={draft.start_date}
                                    onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor={`end-${key}`} className="text-xs text-muted-foreground">
                                    End Date
                                  </Label>
                                  <Input
                                    id={`end-${key}`}
                                    type="date"
                                    value={draft.end_date}
                                    onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleSave(tenant.id, project.id)}
                                  disabled={isPending}
                                >
                                  {isPending ? "Saving..." : "Save"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={handleCancel}
                                  disabled={isPending}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}

                          {projMessage && (
                            <p
                              className={`text-xs ${
                                projMessage.type === "success" ? "text-green-700" : "text-red-700"
                              }`}
                            >
                              {projMessage.text}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
