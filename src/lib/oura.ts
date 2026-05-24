import { optionalEnv } from "@/lib/config";

export function ouraRedirectUri() {
  const baseUrl = optionalEnv("APP_URL") || "http://localhost:3000";
  return new URL("/api/connections/oura/callback", baseUrl).toString();
}
