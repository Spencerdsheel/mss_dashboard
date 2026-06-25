import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";

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
            {/* TODO: Replace with <Image src="/isn-logo.svg"> when logo file is provided */}
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-brand-foreground text-xs font-bold">
              iSN
            </div>
            <span>iSN Dashboard</span>
          </div>
        </div>
        <div className="relative space-y-6">
          <p className="text-3xl font-semibold leading-tight tracking-tight">
            Real time unified retail Dashboard
          </p>
        </div>
        <div className="relative text-xs text-white/50">
          © {new Date().getFullYear()} iSN Dashboard
        </div>
      </div>

      <div className="flex w-full items-center justify-center p-6 md:w-1/2">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="text-sm text-muted-foreground">
              Use your credentials to access the dashboard.
            </p>
          </div>

          <LoginForm initialError={hasError ? "error" : undefined} callbackUrl={params.callbackUrl} />
        </div>
      </div>
    </div>
  );
}
