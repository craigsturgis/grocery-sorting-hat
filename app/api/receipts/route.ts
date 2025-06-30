import { NextResponse } from "next/server";
import { UserDatabase } from "@/lib/d1-db";
import { requireAuth } from "@/lib/auth-helpers";
import { getCloudflareEnv } from "@/lib/cloudflare-env";

export const runtime = "edge";

// GET all receipts
export async function GET() {
  try {
    const env = getCloudflareEnv();
    const user = await requireAuth();
    
    const userDb = new UserDatabase(env.DB, user.id);
    const receipts = await userDb.getReceipts();

    return NextResponse.json(receipts.results);
  } catch (error) {
    console.error("Failed to fetch receipts:", error);
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to fetch receipts" },
      { status: 500 }
    );
  }
}