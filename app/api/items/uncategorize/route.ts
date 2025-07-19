import { NextResponse, NextRequest } from "next/server";
import { UserDatabase } from "@/lib/d1-db";
import { requireAuth } from "@/lib/auth-helpers";
import { getCloudflareEnv } from "@/lib/cloudflare-env";

export const runtime = "edge";

// POST route to reset item categorization
export async function POST(request: NextRequest) {
  try {
    const env = getCloudflareEnv();
    const user = await requireAuth();
    const { itemId } = await request.json() as { itemId: number };

    if (!itemId) {
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 }
      );
    }

    const userDb = new UserDatabase(env.DB, user.id);
    
    // Reset the item's category to null
    await userDb.updateItemCategory(itemId, null);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to uncategorize item:", error);
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to uncategorize item" },
      { status: 500 }
    );
  }
}