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
function parseKrogerGroceryList(
  text: string
): { name: string; price: number }[] {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const items: { name: string; price: number }[] = [];

  let currentItem: { name: string; price: number | null } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip lines that are clearly not product names or prices
    if (
      line.includes("SNAP EBT") ||
      line.includes("Save to List") ||
      line.includes("Add to Cart") ||
      line.includes("Featured") ||
      line.includes("View Offer") ||
      line.includes("Buy 2 For") ||
      line.includes("Saved, View List") ||
      /^\d+ (oz|fl oz|lbs|ct)$/.test(line) ||
      /^\d+ ct \/ \d+oz$/.test(line)
    ) {
      continue;
    }

    // Check if this is a product name line (usually ends with ", 1 total" or similar)
    if (
      line.match(/,\s+[\d\.]+\s+total$/) ||
      // Also recognize standalone product names that don't follow the standard pattern
      (i < lines.length - 1 &&
        !line.includes("$") &&
        !line.match(/^\d/) &&
        !line.includes("discounted from") &&
        lines[i + 1].includes("$"))
    ) {
      // If we have a previous item, add it to our items list
      if (currentItem && currentItem.price !== null) {
        items.push({
          name: currentItem.name,
          price: currentItem.price,
        });
      }

      // Start a new item, removing the ", X total" suffix if present
      currentItem = {
        name: line.replace(/,\s+[\d\.]+\s+total$/, "").trim(),
        price: null,
      };
    }
    // Check if this is a price line (contains price with $ sign)
    else if (line.match(/^\$[\d\.]+$/)) {
      // This is a standalone price line (e.g., "$1.15")
      const priceMatch = line.match(/\$[\d\.]+/);
      if (priceMatch && currentItem) {
        currentItem.price = parseFloat(priceMatch[0].replace("$", ""));

        // Check if the next line indicates this is a discounted price
        // If so, skip the "discounted from" and the original price lines
        if (i + 1 < lines.length && lines[i + 1].trim() === "discounted from") {
          // Skip the "discounted from" line
          i++;
          // Skip the original price line
          if (
            i + 1 < lines.length &&
            lines[i + 1].trim().match(/^\$[\d\.]+$/)
          ) {
            i++;
          }
        }
      }
    }
    // Skip "discounted from" lines since we handle them in the price section
    else if (line === "discounted from") {
      continue;
    }
    // Handle weight-based items (e.g., "0.64 lbs x $0.98/each")
    else if (line.match(/[\d\.]+\s+lbs\s+x\s+\$[\d\.]+\/each/)) {
      // Check if the next line is a direct price
      if (i + 1 < lines.length && lines[i + 1].trim().match(/^\$[\d\.]+$/)) {
        // Use the actual price on the next line instead of calculating
        i++; // Move to the next line
        const priceMatch = lines[i].match(/\$[\d\.]+/);
        if (priceMatch && currentItem) {
          currentItem.price = parseFloat(priceMatch[0].replace("$", ""));
        }
      } else {
        // Calculate price from weight and unit price
        const weightMatch = line.match(/^([\d\.]+)\s+lbs/);
        const priceMatch = line.match(/\$([\d\.]+)\/each/);

        if (weightMatch && priceMatch && currentItem) {
          const weight = parseFloat(weightMatch[1]);
          const unitPrice = parseFloat(priceMatch[1]);
          currentItem.price = parseFloat((weight * unitPrice).toFixed(2));
        }
      }
    }
    // Handle "X x $Y.ZZ/each" format
    else if (line.match(/\d+\s+x\s+\$[\d\.]+\/each/)) {
      // Extract price from this format
      const priceMatch = line.match(/\$([\d\.]+)\/each/);
      if (priceMatch && currentItem && currentItem.price === null) {
        currentItem.price = parseFloat(
          priceMatch[0].replace("$", "").replace("/each", "")
        );
      }
    }
    // Check for any line with a price in it as a fallback
    else if (line.match(/\$[\d\.]+/) && !line.includes("discounted from")) {
      const priceMatch = line.match(/\$[\d\.]+/);
      if (priceMatch && !currentItem) {
        // This might be a lone price with no preceding item name
        // Check if we can find an item name in a previous line
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          const prevLine = lines[j].trim();
          if (
            !prevLine.includes("$") &&
            !prevLine.match(/^\d/) &&
            !prevLine.includes("SNAP EBT") &&
            !prevLine.includes("Save to List") &&
            !prevLine.includes("Add to Cart")
          ) {
            currentItem = {
              name: prevLine,
              price: parseFloat(priceMatch[0].replace("$", "")),
            };
            break;
          }
        }
      } else if (priceMatch && currentItem && currentItem.price === null) {
        currentItem.price = parseFloat(priceMatch[0].replace("$", ""));
      }
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