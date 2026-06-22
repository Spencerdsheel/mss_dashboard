import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { DEMO_ADMIN_EMAIL, DEMO_CLIENT_EMAIL, DEMO_PASSWORD } from "@/lib/constants";

export const dynamic = "force-dynamic";

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
  
  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white md:flex">
        <div className="absolute inset-0 opacity-20 [background:radial-gradient(800px_circle_at_20%_10%,#f97316,transparent),radial-gradient(600px_circle_at_80%_90%,#38bdf8,transparent)]" />
        <div className="relative">
          <div className="flex items-center gap-3 text-lg font-semibold tracking-tight">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-brand-foreground">
              SM
            </div>
            <span>Prototype Dashboard</span>
          </div>
        </div>
        <div className="relative space-y-6">
          <p className="text-3xl font-semibold leading-tight tracking-tight">
            Real-time retail execution
            <br />
            for <span className="text-brand">Demo Client</span>.
          </p>
          <p className="max-w-md text-sm text-white/70">
            Project <strong>Messi and Flying Fish</strong> — visits, photos, and
            installation KPIs unified in a single client-ready view.
          </p>
        </div>
        <div className="relative text-xs text-white/50">
          © {new Date().getFullYear()} Prototype Dashboard — Demo build
        </div>
      </div>

      <div className="flex w-full items-center justify-center p-6 md:w-1/2">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="text-sm text-muted-foreground">
              Use your demo credentials to access the dashboard.
            </p>
          </div>

          <LoginForm initialError={hasError ? "error" : undefined} callbackUrl={params.callbackUrl} />

          <div className="rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
            <div className="mb-2 font-medium text-foreground">Demo accounts</div>
            <div className="grid gap-1">
              <div>
                <span className="font-mono">{DEMO_ADMIN_EMAIL}</span> ·{" "}
                <span className="font-mono">{DEMO_PASSWORD}</span>{" "}
                <span className="text-muted-foreground">(admin)</span>
              </div>
              <div>
                <span className="font-mono">{DEMO_CLIENT_EMAIL}</span> ·{" "}
                <span className="font-mono">{DEMO_PASSWORD}</span>{" "}
                <span className="text-muted-foreground">(client)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
