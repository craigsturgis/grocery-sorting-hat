import { NextRequest, NextResponse } from "next/server";
import { UserDatabase } from "@/lib/d1-db";
import { requireAuth } from "@/lib/auth-helpers";
import { getCloudflareEnv } from "@/lib/cloudflare-env";

export const runtime = "edge";

// Interfaces for type safety

interface CategoryTotal {
  id: number | null;
  name: string;
  total: number;
  totalTax: number;
  totalWithTax: number;
  count: number;
}

// GET a single receipt with all items and categories
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const env = getCloudflareEnv();
    const user = await requireAuth();
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Receipt ID is required" },
        { status: 400 }
      );
    }

    const userDb = new UserDatabase(env.DB, user.id);
    const receipt = await userDb.getReceiptById(Number(id));

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    // Calculate category totals from items
    const categoryTotals: CategoryTotal[] = [];
    const categoryMap = new Map<string, { total: number; totalTax: number; count: number }>();

    for (const item of receipt.items as Array<{ category_name: string | null; price: number; taxable: boolean }>) {
      const categoryKey = item.category_name || "Uncategorized";
      const existing = categoryMap.get(categoryKey) || { total: 0, totalTax: 0, count: 0 };
      const itemTax = item.taxable ? item.price * 0.07 : 0;
      
      categoryMap.set(categoryKey, {
        total: existing.total + item.price,
        totalTax: existing.totalTax + itemTax,
        count: existing.count + 1,
      });
    }

    for (const [name, data] of categoryMap.entries()) {
      categoryTotals.push({
        id: name === "Uncategorized" ? null : 1, // We'll simplify this for now
        name,
        total: data.total,
        totalTax: data.totalTax,
        totalWithTax: data.total + data.totalTax,
        count: data.count,
      });
    }

    // Calculate total amount
    const totalAmount = (receipt.items as Array<{ price: number }>).reduce(
      (sum: number, item: { price: number }) => sum + item.price,
      0
    );

    // Calculate tax amount (7% for taxable items)
    const totalTax = (receipt.items as Array<{ taxable: boolean; price: number }>).reduce((sum: number, item: { taxable: boolean; price: number }) => {
      return sum + (item.taxable ? item.price * 0.07 : 0);
    }, 0);

    return NextResponse.json({
      ...receipt,
      categoryTotals,
      totalAmount,
      totalTax,
    });
  } catch (error) {
    console.error("Failed to fetch receipt details:", error);
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to fetch receipt details" },
      { status: 500 }
    );
  }
}