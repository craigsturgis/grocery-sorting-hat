import { NextResponse, NextRequest } from "next/server";
import { UserDatabase } from "@/lib/d1-db";
import { requireAuth } from "@/lib/auth-helpers";
import { getCloudflareEnv } from "@/lib/cloudflare-env";

export const runtime = "edge";

// Function to parse grocery list based on source
function parseGroceryList(
  text: string,
  source: string
): { name: string; price: number }[] {
  // Different parsing strategies based on store
  if (source === "kroger") {
    return parseKrogerGroceryList(text);
  } else if (source === "walmart") {
    return parseWalmartGroceryList(text);
  } else {
    // Generic parser for other stores (Target, etc.)
    return parseGenericGroceryList(text);
  }
}

// Parser for Kroger format
// Handles the new Kroger purchases page format with "Save to List" blocks
// and "Received: X Paid: $Y.ZZ" structure
function parseKrogerGroceryList(
  text: string
): { name: string; price: number }[] {
  const items: { name: string; price: number }[] = [];

  // Split into item blocks using "Save to List" or "Saved, View List" as delimiters
  const blocks = text.split(/(?=Save to List|Saved, View List)/);

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter((line) => line !== "");

    if (lines.length < 3) continue;

    // Find the product name - it's the first line after "Save to List" or "Saved, View List"
    // that isn't a UI element. The name typically appears twice, so we take the first occurrence.
    let productName: string | null = null;
    let paidPrice: number | null = null;

    // Lines to skip when looking for product name
    const skipPatterns = [
      /^Save to List$/,
      /^Saved, View List$/,
      /^SNAP EBT$/,
      /^Add to Cart$/,
      /^Low Stock$/,
      /^Item Unavailable$/,
      /^\d+(\.\d+)?\s*(oz|fl oz|lbs?|ct|gal|bag|Pack)/, // Size/weight lines
      /^\$\d+\.\d+/, // Price lines
      /^about/, // "about $X.XX each" lines
      /^Price Cut$/,
      /^Buy \d+/, // Promotional text like "Buy 1 Get 1"
      /^Save \$/, // "Save $X" promotions
      /^Coupon:/, // Coupon lines
      /^Received:/, // Received/Paid lines
      /discounted from/,
    ];

    for (const line of lines) {
      // Skip UI elements and metadata
      if (skipPatterns.some((pattern) => pattern.test(line))) {
        continue;
      }

      // Found the product name
      if (!productName) {
        productName = line;
        break;
      }
    }

    // Find the "Paid:" price - look for "Received: X Paid:" pattern
    // The price follows on the same line or the next line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for "Received: X Paid:" or just "Paid:" pattern
      if (line.includes("Paid:")) {
        // Try to extract price from same line first (e.g., "Received: 1 Paid: $5.49")
        const sameLine = line.match(/Paid:\s*\$?([\d.]+)/);
        if (sameLine) {
          paidPrice = parseFloat(sameLine[1]);
        } else {
          // Price is on the next line
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            // Extract first price (the actual paid amount, not "discounted from" amount)
            const priceMatch = nextLine.match(/\$([\d.]+)/);
            if (priceMatch) {
              paidPrice = parseFloat(priceMatch[1]);
            }
          }
        }
        break;
      }
    }

    // Add item if we found both name and price
    if (productName && paidPrice !== null) {
      items.push({
        name: productName,
        price: paidPrice,
      });
    }
  }

  return items;
}

// Parser for Walmart format
function parseWalmartGroceryList(
  text: string
): { name: string; price: number }[] {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const items: { name: string; price: number }[] = [];

  let currentItem: { name: string; price: number | null } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip "Shopped" header and cart/review button lines
    if (
      line === "Shopped" ||
      line === "Add to cart" ||
      line === "Review item" ||
      line === "" ||
      line === "Approved substitution" ||
      line === "Weight-adjusted"
    ) {
      continue;
    }

    // Skip Walmart Cash line
    if (line.includes("Walmart Cash")) {
      continue;
    }

    // Skip standalone numbers (like "2", "3", "4") that appear in the receipt
    if (/^\d+$/.test(line)) {
      continue;
    }

    // Handle standard price line (standalone price)
    if (line.match(/^\$\d+\.\d+$/)) {
      const priceMatch = line.match(/\$(\d+\.\d+)/);

      if (priceMatch && currentItem) {
        currentItem.price = parseFloat(priceMatch[1]);

        // Add the current item to our list and reset
        items.push({
          name: currentItem.name,
          price: currentItem.price,
        });
        currentItem = null;
      }
      continue;
    }

    // Handle per lb price format (e.g., "$5.75/lb")
    if (line.match(/\$\d+\.\d+\/lb/)) {
      // This is a unit price line, not the total price
      continue;
    }

    // Handle "Discount price $X.XX" format
    if (line.match(/Discount price \$\d+\.\d+/)) {
      const priceMatch = line.match(/\$(\d+\.\d+)/);
      if (priceMatch && currentItem) {
        currentItem.price = parseFloat(priceMatch[1]);

        // Skip the next "Was $X.XX" line
        if (i + 1 < lines.length && lines[i + 1].match(/Was \$\d+\.\d+/)) {
          i++;
        }

        // Skip any additional price line
        if (i + 1 < lines.length && lines[i + 1].match(/^\$\d+\.\d+$/)) {
          i++;
        }

        // Add item and reset
        items.push({
          name: currentItem.name,
          price: currentItem.price,
        });
        currentItem = null;
      }
      continue;
    }

    // Handle savings line and skip it
    if (line.match(/\$\d+\.\d+\s+from savings/)) {
      continue;
    }

    // Handle price with "Was" format
    if (
      line.match(/\$\d+\.\d+\s+Was \$\d+\.\d+/) ||
      line.match(/Was \$\d+\.\d+/) ||
      line.match(/\$\d+\.\d+$/)
    ) {
      // Get the first price mentioned (current price, not "Was" price)
      const priceMatch = line.match(/\$(\d+\.\d+)/);
      if (priceMatch && currentItem) {
        currentItem.price = parseFloat(priceMatch[1]);

        // Add the current item to our list and reset
        items.push({
          name: currentItem.name,
          price: currentItem.price,
        });
        currentItem = null;
      }
      continue;
    }

    // Handle multiple items with individual prices (e.g., "Qty 2 $8.28 $4.14 ea")
    if (line.match(/Qty \d+\s+\$\d+\.\d+/)) {
      const priceMatch = line.match(/\$(\d+\.\d+)/);

      if (priceMatch && currentItem) {
        // Use the total price, not the individual price
        currentItem.price = parseFloat(priceMatch[1]);

        // Add the current item to our list and reset
        items.push({
          name: currentItem.name,
          price: currentItem.price,
        });
        currentItem = null;
      }
      continue;
    }

    // Skip quantity, multipack, count, and unit price lines
    if (
      line.match(/^Qty \d+$/) ||
      line.match(/^Multipack Quantity: \d+$/) ||
      line.match(/^Count: \d+$/) ||
      line.match(/^Count Per Pack: \d+$/) ||
      line.match(/^\d+\.\d+¢\/[a-z]+$/) ||
      line.match(/\$\d+\.\d+\/[a-z]+/) ||
      line.match(/\$\d+\.\d+ ea/) ||
      line.match(/^Size: \d+$/) ||
      line.match(/^Actual Color: [A-Za-z]+$/)
    ) {
      continue;
    }

    // If we have any line that doesn't match above patterns and isn't a price, it's likely a product name
    if (!line.match(/\$\d+\.\d+/) && !currentItem) {
      currentItem = {
        name: line,
        price: null,
      };
    }
  }

  // Don't forget to add the last item if it exists
  if (currentItem && currentItem.price !== null) {
    items.push({
      name: currentItem.name,
      price: currentItem.price,
    });
  }

  return items;
}

// Generic parser for simple "Item $Price" format
function parseGenericGroceryList(
  text: string
): { name: string; price: number }[] {
  const pattern = /(.+)\s+(\$\d+\.\d+)\s*/;
  const lines = text.split("\n").filter((line) => line.trim() !== "");

  const items = lines
    .map((line) => {
      const match = line.match(pattern);

      if (match) {
        const name = match[1];
        const priceStr = match[2];
        const price = parseFloat(priceStr.replace("$", ""));

        return {
          name: name.trim(),
          price: isNaN(price) ? 0 : price,
        };
      }

      return null;
    })
    .filter((item) => item !== null) as { name: string; price: number }[];

  return items;
}

// Types for our items
interface GroceryItem {
  id: number;
  name: string;
  price: number;
  category_id: number | null;
  is_new: boolean;
  taxable: boolean;
}

interface UncategorizedItem {
  id: number;
  name: string;
  price: number;
  taxable: boolean;
}

// POST route to parse and process grocery list
export async function POST(request: NextRequest) {
  try {
    const env = getCloudflareEnv();
    const user = await requireAuth();
    const { text, source } = await request.json() as { text: string; source: string };

    if (!text) {
      return NextResponse.json(
        { error: "Grocery list text is required" },
        { status: 400 }
      );
    }

    if (!source) {
      return NextResponse.json(
        { error: "Source is required" },
        { status: 400 }
      );
    }

    // Parse the grocery list
    const parsedItems = parseGroceryList(text, source);

    if (parsedItems.length === 0) {
      return NextResponse.json(
        { error: "No valid items found in the grocery list" },
        { status: 400 }
      );
    }

    const userDb = new UserDatabase(env.DB, user.id);

    // Create a new receipt
    const receiptResult = await userDb.createReceipt(source);
    const receiptId = Number(receiptResult.meta.last_row_id);

    // Process each item
    const items: GroceryItem[] = [];
    const uncategorizedItems: UncategorizedItem[] = [];

    for (const { name, price } of parsedItems) {
      // Check if item exists for this user
      const existingItem = await userDb.getItemByName(name);

      if (existingItem) {
        // Use existing item
        const itemId = existingItem.id as number;
        const taxable = existingItem.taxable === 1;

        // Add to receipt items
        await userDb.addReceiptItem(receiptId, itemId, price, taxable);

        // Add to result
        items.push({
          id: itemId,
          name,
          price,
          category_id: existingItem.category_id as number | null,
          is_new: false,
          taxable,
        });

        // Check if uncategorized
        if (existingItem.category_id === null) {
          uncategorizedItems.push({
            id: itemId,
            name,
            price,
            taxable,
          });
        }
      } else {
        // Create new item without category
        const newItemResult = await userDb.createOrUpdateItem(
          name,
          price,
          source,
          undefined,
          false
        );
        
        const newItemId = Number(newItemResult.meta.last_row_id);

        // Add to receipt items
        await userDb.addReceiptItem(receiptId, newItemId, price, false);

        // Add to result
        items.push({
          id: newItemId,
          name,
          price,
          category_id: null,
          is_new: true,
          taxable: false,
        });

        // Add to uncategorized
        uncategorizedItems.push({
          id: newItemId,
          name,
          price,
          taxable: false,
        });
      }
    }

    // Return results
    return NextResponse.json(
      {
        receiptId,
        items,
        uncategorizedItems,
        totalItems: items.length,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to parse grocery list:", error);
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to parse grocery list" },
      { status: 500 }
    );
  }
}