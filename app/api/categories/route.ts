import { NextRequest, NextResponse } from "next/server";
import { UserDatabase } from "@/lib/d1-db";
import { requireAuth } from "@/lib/auth-helpers";
import { getCloudflareEnv } from "@/lib/cloudflare-env";

export const runtime = "edge";

// GET all categories
export async function GET() {
  try {
    const env = getCloudflareEnv();
    const user = await requireAuth();
    
    const userDb = new UserDatabase(env.DB, user.id);
    const categories = await userDb.getCategories();
    
    return NextResponse.json(categories.results);
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

// POST new category
export async function POST(request: NextRequest) {
  try {
    const env = getCloudflareEnv();
    const user = await requireAuth();
    const { name } = await request.json() as { name: string };

    if (!name) {
      return NextResponse.json(
        { error: "Category name is required" },
        { status: 400 }
      );
    }

    const userDb = new UserDatabase(env.DB, user.id);
    const result = await userDb.createCategory(name);

    return NextResponse.json({ id: result.meta.last_row_id, name }, { status: 201 });
  } catch (error) {
    console.error("Failed to create category:", error);
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Check if it's a unique constraint violation
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      return NextResponse.json(
        { error: "Category already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 }
    );
  }
}

// DELETE category by ID
export async function DELETE(request: NextRequest) {
  try {
    const env = getCloudflareEnv();
    const user = await requireAuth();
    const { id } = await request.json() as { id: number };

    if (!id) {
      return NextResponse.json(
        { error: "Category ID is required" },
        { status: 400 }
      );
    }

    // Check if any items use this category
    const itemsWithCategory = await env.DB
      .prepare("SELECT COUNT(*) as count FROM items WHERE category_id = ? AND user_id = ?")
      .bind(id, user.id)
      .first<{ count: number }>();

    if (itemsWithCategory && itemsWithCategory.count > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete category that has items assigned to it",
        },
        { status: 409 }
      );
    }

    const userDb = new UserDatabase(env.DB, user.id);
    const result = await userDb.deleteCategory(id);

    if (!result.success) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to delete category:", error);
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to delete category" },
      { status: 500 }
    );
  }
}
