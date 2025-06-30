import { NextRequest, NextResponse } from "next/server";
import { UserDatabase } from "@/lib/d1-db";
import { requireAuth } from "@/lib/auth-helpers";
import { getCloudflareEnv } from "@/lib/cloudflare-env";

export const runtime = "edge";

// POST route to update taxable status of an item
export async function POST(request: NextRequest) {
  try {
    const env = getCloudflareEnv();
    const user = await requireAuth();
    const { itemId, taxable } = await request.json() as { itemId: number; taxable: boolean };

    if (itemId === undefined) {
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 }
      );
    }

    if (typeof taxable !== "boolean") {
      return NextResponse.json(
        { error: "Taxable status must be a boolean" },
        { status: 400 }
      );
    }

    const userDb = new UserDatabase(env.DB, user.id);

    // Update the item's taxable status
    await userDb.updateItemTaxable(itemId, taxable);

    // Also update all existing receipt_items for this item for consistency
    await env.DB
      .prepare("UPDATE receipt_items SET taxable = ? WHERE item_id = ?")
      .bind(taxable ? 1 : 0, itemId)
      .run();

    // Return success response
    return NextResponse.json(
      {
        message: "Item taxable status updated successfully",
        itemId,
        taxable,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Failed to update taxable status:", error);
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to update taxable status" },
      { status: 500 }
    );
  }
}