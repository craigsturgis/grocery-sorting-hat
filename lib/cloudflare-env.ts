import type { Env } from "./d1-db";
import { getRequestContext } from "@cloudflare/next-on-pages";

// Helper to get Cloudflare environment bindings
export function getCloudflareEnv(): Env {
  try {
    // Use the proper getRequestContext API
    const { env } = getRequestContext();
    const cloudflareEnv = env as unknown as Env;
    
    if (cloudflareEnv?.DB) {
      return cloudflareEnv;
    }
  } catch {
    console.warn("getRequestContext not available, likely in development");
  }
  
  // In development or if bindings aren't available, return mock values
  console.warn("Cloudflare bindings not found, using mock values");
  return {
    DB: {} as Env["DB"],
    SESSIONS: {} as Env["SESSIONS"],
    AUTH_SECRET: process.env.AUTH_SECRET || "dev-secret",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "http://localhost:3000",
  };
}