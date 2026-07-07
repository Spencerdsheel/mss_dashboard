"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "./actions";

export function LoginForm({
  initialError,
  callbackUrl,
}: {
  initialError?: string;
  callbackUrl?: string;
}) {
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (callbackUrl) {
      form.set("callbackUrl", callbackUrl);
    }
    startTransition(() => {
      loginAction(form);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-white/80">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder=""
          required
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-white/80">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder=""
          required
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
        />
      </div>
      {initialError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Invalid credentials.
        </div>
      )}
      <Button className="w-full bg-[#ff682c] text-white hover:bg-[#ff682c]/90" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-white/50">
        <a href="/reset-password" className="underline underline-offset-4 hover:text-white">
          Forgot password?
        </a>
      </p>
    </form>
  );
}
