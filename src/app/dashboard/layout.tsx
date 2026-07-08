import { requireSession } from "@/server/rbac";
import { AppShell } from "@/components/app-shell";

async function fetchPublicSetting(baseUrl: string, key: string, fallback: string): Promise<string> {
  try {
    const resp = await fetch(`${baseUrl}/auth/settings/public/${key}`, {
      next: { revalidate: 60 },
    });
    if (resp.ok) {
      const data = await resp.json();
      return data.value || fallback;
    }
  } catch {}
  return fallback;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const baseUrl = process.env.BACKEND_API_URL ?? "http://localhost:8010";

  const [siteTitle, logoText, footerText, brandColor] = await Promise.all([
    fetchPublicSetting(baseUrl, "site_title", "iSN"),
    fetchPublicSetting(baseUrl, "logo_text", "iSN"),
    fetchPublicSetting(baseUrl, "footer_text", "iSN Dashboard"),
    fetchPublicSetting(baseUrl, "brand_color", "#ff682c"),
  ]);

  return (
    <AppShell
      session={session as any}
      siteTitle={siteTitle}
      logoText={logoText}
      footerText={footerText}
      brandColor={brandColor}
    >
      {children}
    </AppShell>
  );
}
