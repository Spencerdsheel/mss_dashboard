"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  type AdminUser,
  type AdminTenant,
} from "@/server/admin-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createUserAction, updateUserAction, getProjectsForTenant, issuePasswordResetAction } from "./actions";
import { ROLE_LABELS } from "@/types/role";

interface UsersClientProps {
  users: AdminUser[];
  tenants: AdminTenant[];
  callerRole?: string;
}

type ResetResult = { token: string; expires_at: string; user_id: string } | null;

export function UsersClient({ users, tenants, callerRole }: UsersClientProps) {
  const router = useRouter();
  const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t.name]));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Password-reset panel state
  const [resetPanelUserId, setResetPanelUserId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<ResetResult>(null);
  const [issuingReset, setIssuingReset] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleIssueReset = async (userId: string) => {
    setResetPanelUserId(userId);
    setResetResult(null);
    setResetError(null);
    setCopied(false);
    setIssuingReset(true);
    try {
      const result = await issuePasswordResetAction(userId);
      setResetResult(result);
    } catch (err) {
      setResetError((err as Error).message || "Failed to issue reset code");
    } finally {
      setIssuingReset(false);
    }
  };

  const handleCopyToken = () => {
    if (resetResult?.token) {
      navigator.clipboard.writeText(resetResult.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const [formData, setFormData] = useState({
    email: "",
    name: "",
    password: "",
    role: "TENANT_USER",
    tenant_id: "none" as string | null,
    project_ids: [] as string[],
    tenant_ids: [] as string[],
  });

  const handleOpenCreate = () => {
    setEditingUser(null);
    setAvailableProjects([]);
    setFormData({
      email: "",
      name: "",
      password: "",
      role: "TENANT_USER",
      tenant_id: "none",
      project_ids: [],
      tenant_ids: [],
    });
    setError(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = async (user: AdminUser) => {
    setEditingUser(user);
    setAvailableProjects([]);
    setFormData({
      email: user.email,
      name: user.name || "",
      password: "",
      role: user.role,
      tenant_id: user.tenant_id || "none",
      project_ids: user.project_ids || [],
      tenant_ids: user.tenant_ids || [],
    });
    setError(null);

    if (user.tenant_id && user.role === "TENANT_USER") {
      setIsLoadingProjects(true);
      try {
        const projects = await getProjectsForTenant(user.tenant_id);
        setAvailableProjects(projects);
      } catch (err) {
        setError("Failed to load projects");
      } finally {
        setIsLoadingProjects(false);
      }
    }

    setDialogOpen(true);
  };

  const handleTenantChange = async (value: string) => {
    const newTenantId = value === "none" ? null : value;
    setFormData({ ...formData, tenant_id: newTenantId, project_ids: [] });
    setAvailableProjects([]);

    if (newTenantId && formData.role === "TENANT_USER") {
      setIsLoadingProjects(true);
      try {
        const projects = await getProjectsForTenant(newTenantId);
        setAvailableProjects(projects);
        setFormData((prev) => ({
          ...prev,
          project_ids: projects.map((p) => p.id),
        }));
      } catch (err) {
        setError("Failed to load projects");
      } finally {
        setIsLoadingProjects(false);
      }
    }
  };

  const handleRoleChange = async (value: string) => {
    setFormData({ ...formData, role: value, project_ids: [], tenant_ids: [] });
    setAvailableProjects([]);

    if (value === "TENANT_USER" && formData.tenant_id) {
      setIsLoadingProjects(true);
      try {
        const projects = await getProjectsForTenant(formData.tenant_id);
        setAvailableProjects(projects);
        setFormData((prev) => ({
          ...prev,
          project_ids: projects.map((p) => p.id),
        }));
      } catch (err) {
        setError("Failed to load projects");
      } finally {
        setIsLoadingProjects(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const data = new FormData();
      if (!editingUser) {
        data.set("email", formData.email);
        data.set("name", formData.name);
        data.set("password", formData.password);
        data.set("role", formData.role);
        data.set("tenant_id", formData.role === "CLIENT_ADMIN" ? "" : (formData.tenant_id || ""));
        data.set("project_ids", formData.role === "CLIENT_ADMIN" ? "" : formData.project_ids.join(","));
        data.set("tenant_ids", formData.tenant_ids.join(","));
        await createUserAction(data);
      } else {
        data.set("name", formData.name);
        data.set("role", formData.role);
        data.set("tenant_id", formData.role === "CLIENT_ADMIN" ? "" : (formData.tenant_id || ""));
        data.set("project_ids", formData.role === "CLIENT_ADMIN" ? "" : formData.project_ids.join(","));
        data.set("tenant_ids", formData.tenant_ids.join(","));
        await updateUserAction(editingUser.id, data);
      }
      setDialogOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">User Management</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage user accounts.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/admin")}>
            Back to Admin
          </Button>
          <Button onClick={handleOpenCreate}>Create User</Button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-md text-sm bg-red-100 text-red-800">
          {error}
        </div>
      )}

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-4">Name</th>
              <th className="py-3 px-4">Role</th>
              <th className="py-3 px-4">Tenants</th>
              <th className="py-3 px-4">Projects</th>
              <th className="py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b last:border-b-0">
                <td className="py-3 px-4">{user.email}</td>
                <td className="py-3 px-4">{user.name || "—"}</td>
                <td className="py-3 px-4">
                  <Badge variant={user.role === "PLATFORM_ADMIN" ? "brand" : "secondary"}>
                    {ROLE_LABELS[user.role] ?? user.role}
                  </Badge>
                </td>
                <td className="py-3 px-4 text-xs">
                  {user.tenant_ids && user.tenant_ids.length > 0
                    ? user.tenant_ids.map((tid) => tenantMap[tid] || tid).join(", ")
                    : "—"}
                </td>
                <td className="py-3 px-4 font-mono text-xs">
                  {user.project_ids.join(", ") || "—"}
                </td>
                <td className="py-3 px-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenEdit(user)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleIssueReset(user.id)}
                    >
                      Reset password
                    </Button>
                  </div>
                  {resetPanelUserId === user.id && (
                    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs space-y-2 max-w-sm">
                      {issuingReset && (
                        <p className="text-muted-foreground">Generating reset code…</p>
                      )}
                      {resetError && (
                        <p className="text-red-700">{resetError}</p>
                      )}
                      {resetResult && (
                        <>
                          <p className="font-medium text-amber-900">
                            Reset code generated — share this with the user securely (e.g. direct message or phone). Do not send via email in plaintext.
                          </p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 break-all rounded bg-white border px-2 py-1 text-xs font-mono select-all">
                              {resetResult.token}
                            </code>
                            <Button size="sm" variant="outline" onClick={handleCopyToken}>
                              {copied ? "Copied!" : "Copy"}
                            </Button>
                          </div>
                          <p className="text-amber-700">
                            Expires: {new Date(resetResult.expires_at).toLocaleString()}
                          </p>
                          <p className="text-amber-700">
                            The user redeems this at <strong>/reset-password</strong> with their email and new password.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Edit User" : "Create User"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editingUser && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    required
                    minLength={8}
                    placeholder="Minimum 8 characters"
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={formData.role}
                onValueChange={handleRoleChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {callerRole !== "CLIENT_ADMIN" && (
                    <SelectItem value="PLATFORM_ADMIN">Platform Admin</SelectItem>
                  )}
                  <SelectItem value="CLIENT_ADMIN">Admin</SelectItem>
                  <SelectItem value="TENANT_USER">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.role === "CLIENT_ADMIN" ? (
              <div className="space-y-2">
                <Label>Assigned Tenants</Label>
                <div className="rounded-md border p-3 space-y-2 max-h-40 overflow-y-auto">
                  {tenants.map((tenant) => (
                    <label
                      key={tenant.id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={formData.tenant_ids.includes(tenant.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              tenant_ids: [...formData.tenant_ids, tenant.id],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              tenant_ids: formData.tenant_ids.filter(
                                (id) => id !== tenant.id
                              ),
                            });
                          }
                        }}
                        className="h-4 w-4"
                      />
                      <span className="text-sm">{tenant.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formData.tenant_ids.length} of {tenants.length} tenants selected.
                  Admin automatically accesses all projects of assigned tenants.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="tenant">Tenant</Label>
                  <Select
                    value={formData.tenant_id || ""}
                    onValueChange={handleTenantChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No tenant</SelectItem>
                      {tenants.map((tenant) => (
                        <SelectItem key={tenant.id} value={tenant.id}>
                          {tenant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.role === "TENANT_USER" && formData.tenant_id && (
                  <div className="space-y-2">
                    <Label>Projects</Label>
                    {isLoadingProjects ? (
                      <p className="text-sm text-muted-foreground">Loading projects...</p>
                    ) : availableProjects.length > 0 ? (
                      <>
                        <div className="rounded-md border p-3 space-y-2 max-h-40 overflow-y-auto">
                          {availableProjects.map((project) => (
                            <label
                              key={project.id}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={formData.project_ids.includes(project.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData({
                                      ...formData,
                                      project_ids: [...formData.project_ids, project.id],
                                    });
                                  } else {
                                    setFormData({
                                      ...formData,
                                      project_ids: formData.project_ids.filter(
                                        (id) => id !== project.id
                                      ),
                                    });
                                  }
                                }}
                                className="h-4 w-4"
                              />
                              <span className="text-sm">{project.name}</span>
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formData.project_ids.length} of {availableProjects.length} projects selected
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No projects available for this tenant
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? editingUser
                    ? "Saving..."
                    : "Creating..."
                  : editingUser
                  ? "Save Changes"
                  : "Create User"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
