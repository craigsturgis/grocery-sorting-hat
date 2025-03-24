import { NextResponse } from "next/server";
import db from "../../../lib/db";

// GET all receipts
export async function GET() {
  try {
    const receipts = db
      .prepare(
        `
      SELECT 
        r.id, 
        r.source, 
        r.date,
        COUNT(ri.id) as total_items,
        SUM(ri.price) as total_amount
      FROM receipts r
      LEFT JOIN receipt_items ri ON r.id = ri.receipt_id
      GROUP BY r.id
      ORDER BY r.date DESC
    `
      )
      .all();

    return NextResponse.json(receipts);
  } catch (error) {
    console.error("Failed to fetch receipts:", error);
    return NextResponse.json(
      { error: "Failed to fetch receipts" },
      { status: 500 }
    );
  }
}
