"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSetting } from "./actions";

interface SettingsClientProps {
  settings: Record<string, string>;
  userRole: "PLATFORM_ADMIN" | "CLIENT_ADMIN" | "TENANT_USER";
}

function SettingField({
  label,
  settingKey,
  value,
  type = "text",
  description,
  options,
}: {
  label: string;
  settingKey: string;
  value: string;
  type?: "text" | "email" | "url" | "color" | "select";
  description?: string;
  options?: { value: string; label: string }[];
}) {
  const [current, setCurrent] = useState(value);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const handleSave = () => {
    setStatus("idle");
    startTransition(async () => {
      const result = await updateSetting(settingKey, current);
      setStatus(result.success ? "success" : "error");
      if (result.success) setTimeout(() => setStatus("idle"), 2000);
    });
  };

  const hasChanged = current !== value;

  return (
    <div className="space-y-2">
      <Label htmlFor={settingKey}>{label}</Label>
      <div className="flex items-center gap-3">
        {type === "color" ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="color"
              id={settingKey}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent p-0.5"
            />
            <Input
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="max-w-[120px] font-mono text-sm"
              placeholder="#ff682c"
            />
          </div>
        ) : type === "select" && options ? (
          <select
            id={settingKey}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <Input
            id={settingKey}
            type={type}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="flex-1"
          />
        )}
        <Button
          size="sm"
          variant="brand"
          onClick={handleSave}
          disabled={isPending || !hasChanged}
        >
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {status === "success" && (
        <p className="text-xs text-success">Updated successfully.</p>
      )}
      {status === "error" && (
        <p className="text-xs text-destructive">Failed to update.</p>
      )}
    </div>
  );
}

export function SettingsClient({ settings, userRole }: SettingsClientProps) {
  const isAdmin =
    userRole === "PLATFORM_ADMIN" || userRole === "CLIENT_ADMIN";

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1
          className="font-space-grotesk text-3xl font-normal tracking-tight text-foreground"
          style={{ letterSpacing: "-0.04em" }}
        >
          Platform Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure global platform settings.
        </p>
      </div>

      {isAdmin && (
        <section className="card-ventriloc space-y-5 p-6 max-w-lg">
          <h2 className="text-lg font-semibold tracking-tight">Branding</h2>
          <SettingField
            label="Site Title"
            settingKey="site_title"
            value={settings.site_title ?? "iSN"}
            description="Displayed in the header navigation across the dashboard."
          />
          <SettingField
            label="Logo Text"
            settingKey="logo_text"
            value={settings.logo_text ?? "iSN"}
            description="Short text shown in the sidebar badge and login page (max ~5 characters)."
          />
          <SettingField
            label="Footer Text"
            settingKey="footer_text"
            value={settings.footer_text ?? "iSN Dashboard"}
            description="Copyright line shown in the login page footer."
          />
        </section>
      )}

      <section className="card-ventriloc space-y-5 p-6 max-w-lg">
        <h2 className="text-lg font-semibold tracking-tight">Appearance</h2>
        <SettingField
          label="Brand Color"
          settingKey="brand_color"
          value={settings.brand_color ?? "#ff682c"}
          type="color"
          description="Accent color used for buttons, links, and highlights."
        />
        <SettingField
          label="Default Theme"
          settingKey="default_theme"
          value={settings.default_theme ?? "system"}
          type="select"
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          description="Default theme for new users."
        />
        <SettingField
          label="Date Format"
          settingKey="date_format"
          value={settings.date_format ?? "MM/DD/YYYY"}
          type="select"
          options={[
            { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
            { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
            { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
          ]}
          description="How dates are displayed throughout the dashboard."
        />
      </section>

      {isAdmin && (
        <section className="card-ventriloc space-y-5 p-6 max-w-lg">
          <h2 className="text-lg font-semibold tracking-tight">Support</h2>
          <SettingField
            label="Support Email"
            settingKey="support_email"
            value={settings.support_email ?? ""}
            type="email"
            description="Contact email displayed for user support."
          />
          <SettingField
            label="Support URL"
            settingKey="support_url"
            value={settings.support_url ?? ""}
            type="url"
            description="Help page or documentation link."
          />
        </section>
      )}
    </div>
  );
}
