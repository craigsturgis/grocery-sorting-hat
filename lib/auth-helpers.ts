import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { getCloudflareEnv } from "./cloudflare-env";

export interface AuthUser {
  id: string;
  email: string;
}

export async function getUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth-token");
    
    if (!token) {
      return null;
    }

    const env = getCloudflareEnv();
    const secret = new TextEncoder().encode(env.AUTH_SECRET);
    const { payload } = await jwtVerify(token.value, secret);
    
    return payload as unknown as AuthUser;
  } catch (error) {
    console.error("Auth error:", error);
    return null;
  }
}

export async function requireAuth(): Promise<AuthUser> {
  const user = await getUser();
  
  if (!user) {
    throw new Error("Unauthorized");
  }
  
  return user;
}

export async function createAuthToken(user: AuthUser, secret: string): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);
  
  return await new SignJWT(user as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
}