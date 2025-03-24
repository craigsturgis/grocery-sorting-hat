import { NextResponse } from "next/server";
import db from "../../../../lib/db";
import { setupServer } from "../../../../lib/serverSetup";

// Interfaces for type safety
interface ReceiptItem {
  receipt_item_id: number;
  price: number;
  item_id: number;
  name: string;
  category_id: number | null;
  category_name: string | null;
  taxable: boolean;
}

interface CategoryTotal {
  id: number | null;
  name: string;
  total: number;
  count: number;
}

interface UncategorizedTotal {
  total: number;
  count: number;
}

// GET a single receipt with all items and categories
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Initialize the database before processing the request
  await setupServer();

  try {
    // Access id - properly await the params promise
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Receipt ID is required" },
        { status: 400 }
      );
    }

    // Get receipt
    const receipt = db
      .prepare(
        `
      SELECT id, source, date
      FROM receipts
      WHERE id = ?
    `
      )
      .get(id);

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    // Get receipt items with category information
    const items = db
      .prepare(
        `
      SELECT
        ri.id as receipt_item_id,
        ri.price,
        ri.taxable,
        i.id as item_id,
        i.name,
        c.id as category_id,
        c.name as category_name
      FROM receipt_items ri
      JOIN items i ON ri.item_id = i.id
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE ri.receipt_id = ?
      ORDER BY c.name, i.name
    `
      )
      .all(id) as {
      receipt_item_id: number;
      price: number;
      taxable: number;
      item_id: number;
      name: string;
      category_id: number | null;
      category_name: string | null;
    }[];

    // Convert SQLite integer to boolean for taxable field
    const formattedItems = items.map((item) => ({
      receipt_item_id: item.receipt_item_id,
      price: item.price,
      item_id: item.item_id,
      name: item.name,
      category_id: item.category_id,
      category_name: item.category_name,
      taxable: item.taxable === 1,
    })) as ReceiptItem[];

    // Calculate category totals
    const categoryTotals = db
      .prepare(
        `
      SELECT
        c.id,
        c.name,
        SUM(ri.price) as total,
        COUNT(ri.id) as count
      FROM receipt_items ri
      JOIN items i ON ri.item_id = i.id
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE ri.receipt_id = ?
      GROUP BY c.id
      ORDER BY c.name
    `
      )
      .all(id) as CategoryTotal[];

    // Calculate uncategorized total
    const uncategorizedTotal = db
      .prepare(
        `
      SELECT
        SUM(ri.price) as total,
        COUNT(ri.id) as count
      FROM receipt_items ri
      JOIN items i ON ri.item_id = i.id
      WHERE ri.receipt_id = ? AND i.category_id IS NULL
    `
      )
      .get(id) as UncategorizedTotal;

    // Add uncategorized items to category totals
    if (uncategorizedTotal && uncategorizedTotal.count > 0) {
      categoryTotals.push({
        id: null,
        name: "Uncategorized",
        total: uncategorizedTotal.total,
        count: uncategorizedTotal.count,
      });
    }

    // Calculate total amount
    const totalAmount = formattedItems.reduce(
      (sum, item) => sum + item.price,
      0
    );

    // Calculate tax amount (7% for taxable items)
    const totalTax = formattedItems.reduce((sum, item) => {
      return sum + (item.taxable ? item.price * 0.07 : 0);
    }, 0);

    return NextResponse.json({
      ...receipt,
      items: formattedItems,
      categoryTotals,
      totalAmount,
      totalTax,
    });
  } catch (error) {
    console.error("Failed to fetch receipt details:", error);
    return NextResponse.json(
      { error: "Failed to fetch receipt details" },
      { status: 500 }
    );
  }
}
