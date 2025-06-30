import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api/auth (authentication endpoints)
     * - login/register pages
     */
    "/((?!_next/static|_next/image|favicon.ico|public|api/auth|login|register).*)",
  ],
};

export function middleware(request: NextRequest) {
  // For Cloudflare Pages Functions, we'll handle auth checks in the API routes
  // This is because the execution model is different from traditional Next.js
  return NextResponse.next();
}
