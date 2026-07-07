"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { AdminTenant, ProviderConnection } from "@/server/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateConnectionAction } from "./actions";

interface ConnectionsClientProps {
  tenants: AdminTenant[];
  connections: Record<string, ProviderConnection | null>;
}

type DraftConn = {
  display_name: string;
  status: string;
  base_url: string;
};

export function ConnectionsClient({ tenants, connections }: ConnectionsClientProps) {
  const [isPending, startTransition] = useTransition();
  const [editingTenant, setEditingTenant] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftConn>({ display_name: "", status: "active", base_url: "" });
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string; tenantId: string } | null>(null);

  // Local mirror so saves are reflected without full page reload
  const [localConns, setLocalConns] = useState<Record<string, ProviderConnection | null>>(connections);

  const handleEdit = (tenantId: string, conn: ProviderConnection) => {
    setEditingTenant(tenantId);
    setDraft({
      display_name: conn.display_name ?? "",
      status: conn.status,
      base_url: conn.base_url ?? "",
    });
    setMessage(null);
  };

  const handleCancel = () => {
    setEditingTenant(null);
  };

  const handleSave = (tenantId: string) => {
    startTransition(async () => {
      setMessage(null);
      try {
        const updated = await updateConnectionAction(tenantId, {
          display_name: draft.display_name.trim() || null,
          status: draft.status,
          base_url: draft.base_url.trim(),
        });
        setLocalConns((prev) => ({ ...prev, [tenantId]: updated }));
        setMessage({ type: "success", text: "Connection settings updated.", tenantId });
        setEditingTenant(null);
      } catch (err) {
        setMessage({ type: "error", text: `Failed: ${(err as Error).message}`, tenantId });
      }
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Connection Settings</h1>
          <p className="text-sm text-muted-foreground">
            Edit display name, status, and base URL for each tenant&apos;s provider connection.
          </p>
        </div>
        <div className="rounded-md bg-info/10 border border-info/20 p-3 text-xs text-info">
          <strong>Note:</strong> The display name here is for admin reference only. To change the client
          name shown on dashboard project cards, edit it on the{" "}
          <Link href="/admin/projects" className="underline font-medium">Projects page</Link>.
        </div>
      </div>

      {tenants.length === 0 && (
        <p className="text-sm text-muted-foreground">No tenants configured.</p>
      )}

      <div className="space-y-4">
        {tenants.map((tenant) => {
          const conn = localConns[tenant.id];
          const isEditing = editingTenant === tenant.id;
          const tenantMessage = message?.tenantId === tenant.id ? message : null;

          return (
            <Card key={tenant.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{tenant.name}</CardTitle>
                    <CardDescription className="font-mono text-xs">{tenant.id}</CardDescription>
                  </div>
                  {conn ? (
                    <Badge variant={conn.status === "active" ? "success" : "secondary"}>
                      {conn.status}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">no connection</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!conn ? (
                  <p className="text-sm text-muted-foreground">
                    No provider connection configured for this tenant.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {!isEditing ? (
                      <>
                        <div className="grid grid-cols-1 gap-1 text-sm">
                          <div>
                            <span className="text-xs text-muted-foreground">Display Name</span>
                            <p>
                              {conn.display_name ?? (
                                <span className="text-muted-foreground italic">not set</span>
                              )}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Base URL</span>
                            <p className="font-mono text-xs">{conn.base_url ?? <span className="italic">not set</span>}</p>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Status</span>
                            <p>{conn.status}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(tenant.id, conn)}
                        >
                          Edit
                        </Button>
                      </>
                    ) : (
                      <div className="space-y-3 max-w-sm">
                        <div className="space-y-1">
                          <Label htmlFor={`dn-${tenant.id}`} className="text-xs text-muted-foreground">
                            Display Name
                          </Label>
                          <Input
                            id={`dn-${tenant.id}`}
                            value={draft.display_name}
                            onChange={(e) => setDraft((d) => ({ ...d, display_name: e.target.value }))}
                            placeholder="e.g. iSN Production"
                            autoFocus
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`url-${tenant.id}`} className="text-xs text-muted-foreground">
                            Base URL
                          </Label>
                          <Input
                            id={`url-${tenant.id}`}
                            value={draft.base_url}
                            onChange={(e) => setDraft((d) => ({ ...d, base_url: e.target.value }))}
                            placeholder="https://api.shopmetrics.com"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`status-${tenant.id}`} className="text-xs text-muted-foreground">
                            Status
                          </Label>
                          <select
                            id={`status-${tenant.id}`}
                            value={draft.status}
                            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <option value="active">active</option>
                            <option value="inactive">inactive</option>
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSave(tenant.id)}
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

                    {tenantMessage && (
                      <p
                        className={`text-xs ${
                          tenantMessage.type === "success" ? "text-success" : "text-danger"
                        }`}
                      >
                        {tenantMessage.text}
                      </p>
                    )}
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
