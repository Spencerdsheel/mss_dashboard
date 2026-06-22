"use server";

// BFF server action for the public password-reset redeem endpoint.
// This call is intentionally UNAUTHENTICATED — no auth cookie is read or set.
// The backend always returns a generic 200 response regardless of validity,
// so no sensitive outcome can be inferred here either.

const DEFAULT_BACKEND_API_URL = "http://localhost:8010";

export type RedeemResult = {
  ok: boolean;
  message: string;
};

export async function redeemPasswordResetAction(
  email: string,
  token: string,
  newPassword: string
): Promise<RedeemResult> {
  const baseUrl = process.env.BACKEND_API_URL ?? DEFAULT_BACKEND_API_URL;

  // Fire the request; swallow network errors and return the same generic
  // message so the client cannot distinguish network failures from bad tokens.
  try {
    const response = await fetch(`${baseUrl}/auth/password-reset/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, token, new_password: newPassword }),
      cache: "no-store",
    });

    if (!response.ok) {
      // Backend returned non-200 (e.g. rate limit). Return generic message —
      // do not reveal that the backend rejected the request specifically.
      return {
        ok: true,
        message: "If the reset code is valid, your password has been updated.",
      };
    }

    return (await response.json()) as RedeemResult;
  } catch {
    // Network / parse error — return the same generic message.
    return {
      ok: true,
      message: "If the reset code is valid, your password has been updated.",
    };
  }
}
