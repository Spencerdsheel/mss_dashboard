"use client";

// Public password-reset redeem page.
// No authentication required — this page is reachable without a session.
// On submit it calls the BFF server action which forwards to the backend's
// public /auth/password-reset/redeem endpoint. No auth cookie is set.

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redeemPasswordResetAction } from "./actions";

export default function ResetPasswordPage() {
  const [isPending, startTransition] = useTransition();
  const [clientError, setClientError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);

    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const token = (form.elements.namedItem("token") as HTMLInputElement).value.trim();
    const newPassword = (form.elements.namedItem("new_password") as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem("confirm_password") as HTMLInputElement).value;

    // Client-side validation — server is source of truth for correctness.
    if (newPassword.length < 8) {
      setClientError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setClientError("Passwords do not match.");
      return;
    }
    if (!token.trim()) {
      setClientError("Reset code is required.");
      return;
    }

    startTransition(async () => {
      // The action always returns the generic success message — no branch on outcome.
      await redeemPasswordResetAction(email, token, newPassword);
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Check your password</h1>
            <p className="text-sm text-muted-foreground">
              If the reset code is valid, your password has been updated. You can
              now sign in with your new password.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-block text-sm underline underline-offset-4 hover:text-foreground text-muted-foreground"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email, the reset code provided by your administrator, and
            your new password.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="token">Reset code</Label>
            <Input
              id="token"
              name="token"
              type="text"
              autoComplete="off"
              placeholder="Paste the code from your administrator"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new_password">New password</Label>
            <Input
              id="new_password"
              name="new_password"
              type="password"
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
              required
              minLength={8}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm_password">Confirm new password</Label>
            <Input
              id="confirm_password"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat your new password"
              required
              minLength={8}
            />
          </div>

          {clientError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {clientError}
            </div>
          )}

          <Button className="w-full" variant="brand" disabled={isPending}>
            {isPending ? "Updating…" : "Set new password"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/login"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
