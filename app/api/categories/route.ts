import { NextResponse } from "next/server";
import db from "../../../lib/db";

// GET all categories
export async function GET() {
  try {
    const categories = db
      .prepare("SELECT * FROM categories ORDER BY name")
      .all();
    return NextResponse.json(categories);
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

// POST new category
export async function POST(request: Request) {
  try {
    const { name } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: "Category name is required" },
        { status: 400 }
      );
    }

    const insert = db.prepare(
      "INSERT INTO categories (name) VALUES (?) RETURNING *"
    );
    const category = insert.get(name);

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("Failed to create category:", error);
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
export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Category ID is required" },
        { status: 400 }
      );
    }

    // Check if any items use this category
    const itemsWithCategory = db
      .prepare("SELECT COUNT(*) as count FROM items WHERE category_id = ?")
      .get(id) as { count: number };

    if (itemsWithCategory.count > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete category that has items assigned to it",
        },
        { status: 409 }
      );
    }

    const deleteStatement = db.prepare("DELETE FROM categories WHERE id = ?");
    const result = deleteStatement.run(id);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to delete category:", error);
    return NextResponse.json(
      { error: "Failed to delete category" },
      { status: 500 }
    );
  }
}
