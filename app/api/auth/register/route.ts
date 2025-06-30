import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { UserDatabase, type Env } from "@/lib/d1-db";
import { createAuthToken } from "@/lib/auth-helpers";
import { cookies } from "next/headers";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json() as { email: string; password: string };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Access Cloudflare bindings through getRequestContext
    const { env } = getRequestContext();
    const cloudflareEnv = env as unknown as Env;
    
    if (!cloudflareEnv?.DB) {
      console.error("DB binding not found in request context");
      return NextResponse.json(
        { error: "Database configuration error" },
        { status: 500 }
      );
    }

    // Check if user already exists
    const existingUser = await cloudflareEnv.DB
      .prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first();

    if (existingUser) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userId = crypto.randomUUID();
    await cloudflareEnv.DB
      .prepare("INSERT INTO users (id, email, name) VALUES (?, ?, ?)")
      .bind(userId, email, email)
      .run();

    // Store password in KV (in production, consider a proper auth service)
    await cloudflareEnv.SESSIONS.put(`password:${userId}`, hashedPassword);

    // Create user database instance
    const userDb = new UserDatabase(cloudflareEnv.DB, userId);
    await userDb.ensureUser(email);

    // Create auth token
    const token = await createAuthToken({ id: userId, email }, cloudflareEnv.AUTH_SECRET);

    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set("auth-token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Registration failed: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  }
}