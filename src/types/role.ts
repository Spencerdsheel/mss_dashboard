export type Role = "PLATFORM_ADMIN" | "CLIENT_ADMIN" | "TENANT_USER";

export const ROLE_LABELS: Record<string, string> = {
  PLATFORM_ADMIN: "Platform Admin",
  CLIENT_ADMIN: "Admin",
  TENANT_USER: "User",
};
