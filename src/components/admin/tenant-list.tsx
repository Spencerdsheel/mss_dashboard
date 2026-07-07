"use client";

import { useState } from "react";
import { adminRefreshTenant } from "@/server/admin-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  status: string;
};

export function TenantList({
  tenants,
  token,
}: {
  tenants: Tenant[];
  token: string;
}) {
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [refreshResult, setRefreshResult] = useState<{
    tenantId: string;
    success: boolean;
    message: string;
  } | null>(null);

  const handleRefresh = async (tenantId: string) => {
    setRefreshing(tenantId);
    setRefreshResult(null);
    try {
      const result = await adminRefreshTenant(token, tenantId);
      setRefreshResult({
        tenantId,
        success: true,
        message: `Refresh completed: ${result.rows_pulled} rows pulled`,
      });
    } catch (error) {
      setRefreshResult({
        tenantId,
        success: false,
        message: `Refresh failed: ${(error as Error).message}`,
      });
    } finally {
      setRefreshing(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Tenants</h2>
          <p className="text-sm text-muted-foreground">
            Configured tenants in the backend.
          </p>
        </div>
      </div>

      {refreshResult && (
        <div
          className={`p-3 rounded-md text-sm ${
            refreshResult.success
              ? "bg-success/10 text-success"
              : "bg-danger/10 text-danger"
          }`}
        >
          {refreshResult.message}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm" style={{ minWidth: "500px" }}>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
              <th className="py-3 px-4">Name</th>
              <th className="py-3 px-4">Slug</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="border-b last:border-b-0">
                <td className="py-3 px-4">{tenant.name}</td>
                <td className="py-3 px-4 font-mono text-xs">{tenant.slug}</td>
                <td className="py-3 px-4">
                  <Badge
                    variant={
                      tenant.status === "active" ? "success" : "secondary"
                    }
                  >
                    {tenant.status}
                  </Badge>
                </td>
                <td className="py-3 px-4">
                  <Button
                    size="sm"
                    onClick={() => handleRefresh(tenant.id)}
                    disabled={refreshing === tenant.id}
                    className="bg-blue-500 hover:bg-blue-600"
                  >
                    {refreshing === tenant.id ? "Refreshing..." : "Refresh Data"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
