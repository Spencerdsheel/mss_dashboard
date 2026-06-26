import { requireSession } from "@/server/rbac";
import { AppShell } from "@/components/app-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  let siteTitle = "iSN";
  try {
    const baseUrl = process.env.BACKEND_API_URL ?? "http://localhost:8010";
    const resp = await fetch(`${baseUrl}/auth/settings/public/site_title`, {
      next: { revalidate: 60 },
    });
    if (resp.ok) {
      const data = await resp.json();
      siteTitle = data.value || "iSN";
    }
  } catch (err) {
    console.error("Failed to fetch site title:", err);
  }

  return (
    <AppShell session={session as any} siteTitle={siteTitle}>
      {children}
    </AppShell>
  );
}
