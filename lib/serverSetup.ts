import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { initDatabase } from "./db";

let isDbInitialized = false;

export async function setupServer() {
  if (!isDbInitialized) {
    try {
      initDatabase();
      isDbInitialized = true;
      console.log("Database initialized successfully");
    } catch (error) {
      console.error("Error initializing database:", error);
    }
  }
}

// This function can be used in API routes to ensure the DB is initialized
export async function withDatabase(
  req: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  await setupServer();
  return handler(req);
}
