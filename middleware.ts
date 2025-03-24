import { NextResponse } from "next/server";

// Middleware function
export function middleware() {
  // Simple pass-through middleware
  return NextResponse.next();
}

// Configure the middleware to run for API routes
export const config = {
  matcher: "/api/:path*",
};
