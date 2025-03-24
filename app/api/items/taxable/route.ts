import { NextResponse } from "next/server";
import db from "../../../../lib/db";
import { setupServer } from "../../../../lib/serverSetup";

// POST route to update taxable status of an item
export async function POST(request: Request) {
  // Initialize the database before processing the request
  await setupServer();

  try {
    const { itemId, taxable } = await request.json();

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

    // Update the item's taxable status in the database
    const updateItem = db.prepare("UPDATE items SET taxable = ? WHERE id = ?");

    // Also update all existing receipt_items for this item for consistency
    const updateReceiptItems = db.prepare(
      "UPDATE receipt_items SET taxable = ? WHERE item_id = ?"
    );

    // Start a transaction to ensure both updates succeed or fail together
    const transaction = db.transaction(() => {
      updateItem.run(taxable ? 1 : 0, itemId);
      updateReceiptItems.run(taxable ? 1 : 0, itemId);
    });

    // Execute transaction
    transaction();

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
    return NextResponse.json(
      { error: "Failed to update taxable status" },
      { status: 500 }
    );
  }
}
