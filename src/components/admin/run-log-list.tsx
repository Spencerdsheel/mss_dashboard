"use client";

import { useState, useEffect } from "react";
import { adminListRunLogs, type AdminRunLog } from "@/server/admin-api";
import { Badge } from "@/components/ui/badge";

export function RunLogList({ token }: { token: string }) {
  const [logs, setLogs] = useState<AdminRunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const loadLogs = async () => {
    try {
      const data = await adminListRunLogs(token);
      setLogs(data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to load run logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
    
    const interval = setInterval(loadLogs, 300000);
    return () => clearInterval(interval);
  }, [token]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Sync Run History</h2>
          <p className="text-sm text-muted-foreground">
            Recent data sync runs (auto-refresh every 5 minutes)
          </p>
        </div>
        <div className="text-sm text-muted-foreground">Loading run logs...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Sync Run History</h2>
          <p className="text-sm text-muted-foreground">
            Recent data sync runs (auto-refresh every 5 minutes)
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm" style={{ minWidth: "700px" }}>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
              <th className="py-3 px-4">Tenant</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Started</th>
              <th className="py-3 px-4">Duration</th>
              <th className="py-3 px-4">Rows Pulled</th>
              <th className="py-3 px-4">Error</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 px-4 text-center text-muted-foreground">
                  No sync runs yet
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const duration = log.finished_at
                  ? Math.round(
                      (new Date(log.finished_at).getTime() -
                        new Date(log.started_at).getTime()) /
                        1000
                    ) + "s"
                  : "—";

                return (
                  <tr key={log.id} className="border-b last:border-b-0">
                    <td className="py-3 px-4 font-mono text-xs">{log.tenant_id}</td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          log.status === "success" ? "success" : "destructive"
                        }
                      >
                        {log.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      {new Date(log.started_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">{duration}</td>
                    <td className="py-3 px-4">{log.rows_pulled}</td>
                    <td className="py-3 px-4 max-w-xs truncate text-danger">
                      {log.error_message || "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
