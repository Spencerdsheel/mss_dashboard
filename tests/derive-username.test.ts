// Sprint 16 §4.2 — deriveUsername is a pure helper (no distinct backend
// "username" field exists today; see src/lib/utils.ts's doc comment). This
// test pins its exact output shape so a later swap-in of a real backend
// field can be verified against the same contract.

import { describe, expect, it } from "vitest";
import { deriveUsername } from "@/lib/utils";

describe("deriveUsername", () => {
  it("prefixes the email's local part with #", () => {
    expect(deriveUsername("it@isngs.com")).toBe("#it");
  });

  it("handles local parts containing dots/plus signs verbatim", () => {
    expect(deriveUsername("jane.doe+test@example.com")).toBe("#jane.doe+test");
  });

  it("falls back to the full string if there is no @", () => {
    expect(deriveUsername("not-an-email")).toBe("#not-an-email");
  });

  it("handles an empty string without throwing", () => {
    expect(deriveUsername("")).toBe("#");
  });
});
