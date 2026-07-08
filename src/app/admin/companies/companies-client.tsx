"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  type AdminCompany,
  type AdminTenant,
} from "@/server/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createCompanyAction, updateCompanyAction } from "./actions";

interface CompaniesClientProps {
  companies: AdminCompany[];
  tenants: AdminTenant[];
  userRole: "PLATFORM_ADMIN" | "CLIENT_ADMIN" | "TENANT_USER";
}

export function CompaniesClient({ companies, tenants, userRole }: CompaniesClientProps) {
  const canEdit = userRole === "PLATFORM_ADMIN";
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<AdminCompany | null>(null);
  const [formData, setFormData] = useState({ name: "", slug: "" });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenCreate = () => {
    setEditingCompany(null);
    setFormData({ name: "", slug: "" });
    setError(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (company: AdminCompany) => {
    setEditingCompany(company);
    setFormData({ name: company.name, slug: company.slug });
    setError(null);
    setDialogOpen(true);
  };

  const handleNameChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      name: value,
      slug: editingCompany ? prev.slug : value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const data = new FormData();
      data.set("name", formData.name);
      data.set("slug", formData.slug);

      if (!editingCompany) {
        await createCompanyAction(data);
      } else {
        await updateCompanyAction(editingCompany.id, data);
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
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-sm text-muted-foreground">
            Manage companies and view their assigned tenants.
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button onClick={handleOpenCreate}>Create Company</Button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-md text-sm bg-danger/10 text-danger">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm" style={{ minWidth: "700px" }}>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
              <th className="py-3 px-4">Name</th>
              <th className="py-3 px-4">Slug</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Tenants</th>
              {canEdit && <th className="py-3 px-4">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => {
              const companyTenants = tenants.filter((t) => t.company_id === company.id);
              return (
                <tr key={company.id} className="border-b last:border-b-0">
                  <td className="py-3 px-4 font-medium">{company.name}</td>
                  <td className="py-3 px-4 font-mono text-xs">{company.slug}</td>
                  <td className="py-3 px-4">
                    <Badge variant={company.status === "active" ? "success" : "secondary"}>
                      {company.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-xs text-muted-foreground">
                      {company.tenant_count} tenant{company.tenant_count !== 1 ? "s" : ""}
                    </span>
                    {companyTenants.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {companyTenants.map((t) => t.name).join(", ")}
                      </div>
                    )}
                  </td>
                  {canEdit && (
                    <td className="py-3 px-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenEdit(company)}
                      >
                        Edit
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCompany ? "Edit Company" : "Create Company"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
                placeholder="e.g. Test Corp"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  }))
                }
                required
                placeholder="e.g. test-corp"
              />
              <p className="text-xs text-muted-foreground">
                Lowercase alphanumeric and hyphens only. Auto-generated from name.
              </p>
            </div>
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
                  ? editingCompany
                    ? "Saving..."
                    : "Creating..."
                  : editingCompany
                  ? "Save Changes"
                  : "Create Company"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
