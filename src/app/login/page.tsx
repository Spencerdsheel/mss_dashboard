import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { DataPulseMap } from "./data-pulse";
import { hexToHsl } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function fetchPublicSetting(key: string, fallback: string): Promise<string> {
  try {
    const baseUrl = process.env.BACKEND_API_URL ?? "http://localhost:8010";
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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token");
  if (token) redirect("/dashboard");

  const params = await searchParams;
  const hasError = params.error === "invalid_credentials";

  const [logoText, footerText, brandColor] = await Promise.all([
    fetchPublicSetting("logo_text", "iSN"),
    fetchPublicSetting("footer_text", "iSN Dashboard"),
    fetchPublicSetting("brand_color", "#ff682c"),
  ]);

  const brandOverride =
    brandColor !== "#ff682c"
      ? `:root { --brand: ${hexToHsl(brandColor)}; --primary: ${hexToHsl(brandColor)}; } .dark { --brand: ${hexToHsl(brandColor)}; --primary: ${hexToHsl(brandColor)}; }`
      : null;

  return (
    <div className="flex min-h-screen bg-background">
      {brandOverride && (
        <style dangerouslySetInnerHTML={{ __html: brandOverride }} />
      )}

      {/* LEFT PANEL — map */}
      <div className="hidden flex-[1.35] flex-col px-12 pb-8 pt-10 md:flex">
        <div className="flex items-center gap-3.5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-brand-foreground text-sm font-bold">
            {logoText}
          </div>
          <span className="text-xl font-semibold tracking-tight text-foreground">
            {footerText}
          </span>
        </div>

        <div className="relative my-5 min-h-0 flex-1">
          <DataPulseMap />
        </div>

        <div>
          <p className="text-[34px] font-bold leading-tight tracking-tight text-foreground">
            Real-time unified retail execution
          </p>
          <p className="mt-2.5 text-base text-muted-foreground">
            Monitor mystery shopping visits across regions in real time.
          </p>
        </div>

        <div className="mt-6 text-sm text-muted-foreground/60">
          &copy; {new Date().getFullYear()} {footerText}
        </div>
      </div>

      {/* RIGHT PANEL — form */}
      <div className="flex flex-1 items-center justify-center p-6 md:px-[72px]">
        <div className="w-full max-w-[540px] space-y-6">
          <div className="flex items-center justify-center gap-3 md:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-brand-foreground text-xs font-bold">
              {logoText}
            </div>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              {footerText}
            </span>
          </div>

          <div className="space-y-2 text-center">
            <h1 className="text-[30px] font-bold tracking-tight text-foreground">Sign in</h1>
            <p className="text-base text-muted-foreground">
              Use your credentials to access the dashboard.
            </p>
          </div>

          <LoginForm initialError={hasError ? "error" : undefined} callbackUrl={params.callbackUrl} />
        </div>
      </div>
    </div>
  );
}
