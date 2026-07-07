"use client";

import { useState } from "react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSiteTitle } from "./actions";

interface SettingsClientProps {
  siteTitle: string;
}

export function SettingsClient({ siteTitle }: SettingsClientProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateSiteTitle(form);
      if (result.error) {
        setError(result.error);
      } else if (result.success) {
        setSuccess(true);
      }
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-space-grotesk text-3xl font-normal tracking-tight text-foreground" style={{ letterSpacing: "-0.04em" }}>
          Platform Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure global platform settings.
        </p>
      </div>

      <form onSubmit={onSubmit} className="card-ventriloc p-6 space-y-4 max-w-md">
        <div className="space-y-2">
          <Label htmlFor="site_title">Site Title</Label>
          <Input
            id="site_title"
            name="site_title"
            defaultValue={siteTitle}
            placeholder="iSN"
          />
          <p className="text-xs text-muted-foreground">
            This title appears in the header navigation across the dashboard.
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
            Site title updated successfully.
          </div>
        )}

        <Button type="submit" variant="brand" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </form>
    </div>
  );
}