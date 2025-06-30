import { betterAuth } from "better-auth";
import { D1Adapter } from "@auth/d1-adapter";
import type { D1Database } from "@cloudflare/workers-types";

export function createAuth(db: D1Database) {
  return betterAuth({
    database: D1Adapter(db),
    emailAndPassword: {
      enabled: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;