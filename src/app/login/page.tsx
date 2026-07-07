import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { DataPulseMap } from "./data-pulse";

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
    <div className="flex min-h-screen bg-background">
      {/* LEFT PANEL — map */}
      <div className="hidden flex-[1.35] flex-col px-12 pb-8 pt-10 md:flex">
        <div className="flex items-center gap-3.5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-brand-foreground text-sm font-bold">
            iSN
          </div>
          <span className="text-xl font-semibold tracking-tight text-foreground">
            iSN Dashboard
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
          © {new Date().getFullYear()} iSN Dashboard
        </div>
      </div>

      {/* RIGHT PANEL — form */}
      <div className="flex flex-1 items-center justify-center p-6 md:px-[72px]">
        <div className="w-full max-w-[540px] space-y-6">
          <div className="flex items-center justify-center gap-3 md:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-brand-foreground text-xs font-bold">
              iSN
            </div>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              iSN Dashboard
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
