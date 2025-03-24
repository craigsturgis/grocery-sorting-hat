import { NextResponse } from "next/server";
import db from "../../../../lib/db";

// PUT route to update category for an item
export async function PUT(request: Request) {
  try {
    const { itemId, categoryId } = await request.json();

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

    // Check if item exists
    const itemExists = db
      .prepare("SELECT id FROM items WHERE id = ?")
      .get(itemId);

    if (!itemExists) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // If categoryId is not null, check if category exists
    if (categoryId !== null) {
      const categoryExists = db
        .prepare("SELECT id FROM categories WHERE id = ?")
        .get(categoryId);

      if (!categoryExists) {
        return NextResponse.json(
          { error: "Category not found" },
          { status: 404 }
        );
      }
    }

    // Update item category
    const updateItem = db.prepare(
      "UPDATE items SET category_id = ? WHERE id = ? RETURNING *"
    );
    const updatedItem = updateItem.get(categoryId, itemId);

    return NextResponse.json(updatedItem);
  } catch (error) {
    console.error("Failed to update item category:", error);
    return NextResponse.json(
      { error: "Failed to update item category" },
      { status: 500 }
    );
  }
}

// POST route to categorize multiple items at once
export async function POST(request: Request) {
  try {
    const { items, categoryId } = await request.json();

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

    // If categoryId is not null, check if category exists
    if (categoryId !== null) {
      const categoryExists = db
        .prepare("SELECT id FROM categories WHERE id = ?")
        .get(categoryId);

      if (!categoryExists) {
        return NextResponse.json(
          { error: "Category not found" },
          { status: 404 }
        );
      }
    }

    // Update all items in a transaction
    const updateItem = db.prepare(
      "UPDATE items SET category_id = ? WHERE id = ?"
    );

    const transaction = db.transaction(() => {
      for (const itemId of items) {
        updateItem.run(categoryId, itemId);
      }
    });

    // Run transaction
    transaction();

    return NextResponse.json({
      success: true,
      categorized: items.length,
      categoryId,
    });
  } catch (error) {
    console.error("Failed to categorize items:", error);
    return NextResponse.json(
      { error: "Failed to categorize items" },
      { status: 500 }
    );
  }
}
