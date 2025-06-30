import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createAuthToken } from "@/lib/auth-helpers";
import { cookies } from "next/headers";
import { getCloudflareEnv } from "@/lib/cloudflare-env";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const env = getCloudflareEnv();
    const { email, password } = await request.json() as { email: string; password: string };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Find user
    const user = await env.DB
      .prepare("SELECT id, email FROM users WHERE email = ?")
      .bind(email)
      .first<{ id: string; email: string }>();

    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Check password
    const storedPassword = await env.SESSIONS.get(`password:${user.id}`);
    if (!storedPassword) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(password, storedPassword);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Create auth token
    const token = await createAuthToken({ id: user.id, email: user.email }, env.AUTH_SECRET);

    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Login failed" },
      { status: 500 }
    );
  }
}