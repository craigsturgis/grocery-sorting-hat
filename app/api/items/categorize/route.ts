import { NextRequest, NextResponse } from "next/server";
import { UserDatabase } from "@/lib/d1-db";
import { requireAuth } from "@/lib/auth-helpers";
import { getCloudflareEnv } from "@/lib/cloudflare-env";

export const runtime = "edge";

// PUT route to update category for an item
export async function PUT(request: NextRequest) {
  try {
    const env = getCloudflareEnv();
    const user = await requireAuth();
    const { itemId, categoryId } = await request.json() as { itemId: number; categoryId: number | null };

    if (!itemId) {
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 }
      );
    }

    if (!categoryId && categoryId !== null) {
      return NextResponse.json(
        { error: "Category ID is required" },
        { status: 400 }
      );
    }

    const userDb = new UserDatabase(env.DB, user.id);

    // Update item category
    await userDb.updateItemCategory(itemId, categoryId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update item category:", error);
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to update item category" },
      { status: 500 }
    );
  }
}

// POST route to categorize multiple items at once
export async function POST(request: NextRequest) {
  try {
    const env = getCloudflareEnv();
    const user = await requireAuth();
    const { items, categoryId } = await request.json() as { items: number[]; categoryId: number | null };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "At least one item ID is required" },
        { status: 400 }
      );
    }

    if (!categoryId && categoryId !== null) {
      return NextResponse.json(
        { error: "Category ID is required" },
        { status: 400 }
      );
    }

    const userDb = new UserDatabase(env.DB, user.id);

    // Update all items
    for (const itemId of items) {
      await userDb.updateItemCategory(itemId, categoryId);
    }

    return NextResponse.json({
      success: true,
      categorized: items.length,
      categoryId,
    });
  } catch (error) {
    console.error("Failed to categorize items:", error);
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to categorize items" },
      { status: 500 }
    );
  }
}