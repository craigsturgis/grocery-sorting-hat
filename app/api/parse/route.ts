import { NextResponse, NextRequest } from "next/server";
import { UserDatabase } from "@/lib/d1-db";
import { requireAuth } from "@/lib/auth-helpers";
import { getCloudflareEnv } from "@/lib/cloudflare-env";

export const runtime = "edge";

// Parsed item type - taxable is optional (undefined means use default behavior)
interface ParsedItem {
  name: string;
  price: number;
  taxable?: boolean;
}

// Function to parse grocery list based on source
function parseGroceryList(text: string, source: string): ParsedItem[] {
  // Different parsing strategies based on store
  if (source === "kroger") {
    return parseKrogerGroceryList(text);
  } else if (source === "walmart") {
    return parseWalmartGroceryList(text);
  } else if (source === "costco") {
    return parseCostcoGroceryList(text);
  } else {
    // Generic parser for other stores (Target, etc.)
    return parseGenericGroceryList(text);
  }
}

// Parser for Kroger format
// New format (2025+):
//   Save to List
//   Product Name
//   Product Name (duplicate)
//   SNAP EBT
//   8 oz
//   $5.49
//   Add to Cart
//   Received: 1 Paid:
//   $5.49
// Or for discounted items:
//   $6.49 discounted from $6.99
function parseKrogerGroceryList(
  text: string
): { name: string; price: number }[] {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const items: { name: string; price: number }[] = [];

  // Lines to skip entirely
  const skipPatterns = [
    /^Save to List$/,
    /^SNAP EBT$/,
    /^Add to Cart$/,
    /^Featured$/,
    /^Low Stock$/,
    /^View Offer$/,
    /^Buy \d+ For/,
    /^\d+ For \$[\d.]+$/i, // "2 For $8.00" promotional lines
    /^Saved, View List$/,
    /^Everyday Low Price$/,
    /^Price Cut$/,
    /^Save \$[\d.]+ each/,
    /^\d+\.?\d*\s*(oz|fl oz|lbs?|pt|ct|OZ|OZA|g)(\s+\d+\s+Pack)?$/i, // Size lines like "8 oz", "1 pt", "10.300 OZ", "11.2 oz 2 Pack"
    /^NET WT\s+[\d.]+\s*(oz|OZ|g|lb)/i, // "NET WT 6 OZ (170g)"
    /^\d+\s+ct\s+\/\s+[\d.]+\s*oz$/i, // "10 ct / 1.65 oz"
    /^\d+\s+Biscuits\s+\/\s+[\d.]+\s*oz$/i, // "8 Biscuits / 16.3 oz"
    /^\$[\d.]+\/lb$/, // Price per lb like "$11.99/lb"
    /^about$/, // "about" line before estimated prices
    /^each$/i, // standalone "each" line
    /^\$[\d.]+\s*each\s*$/i, // "$17.51 each"
    /^\$[\d.]+$/, // Standalone price lines that appear before "Received:" (list prices)
  ];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip lines matching skip patterns
    if (skipPatterns.some((pattern) => pattern.test(line))) {
      i++;
      continue;
    }

    // Skip empty lines
    if (!line) {
      i++;
      continue;
    }

    // Check if this looks like a product name line
    // Product names don't start with $, don't start with "Received:", and aren't pure numbers
    const isProductName =
      !line.startsWith("$") &&
      !line.startsWith("Received:") &&
      !line.match(/^\d+$/) &&
      !line.includes("discounted from") &&
      line.length > 2;

    if (isProductName) {
      const productName = line.replace(/,\s+[\d.]+\s+total$/, "").trim();

      // Skip duplicate product name on next line
      if (i + 1 < lines.length && lines[i + 1].trim() === line) {
        i++;
      }

      // Now scan forward to find the "Received: X Paid:" line and the price after it
      let price: number | null = null;
      let j = i + 1;

      while (j < lines.length) {
        const scanLine = lines[j].trim();

        // Found "Received: X Paid:" - the next line should be the actual price
        if (scanLine.startsWith("Received:")) {
          // Check next line for price
          if (j + 1 < lines.length) {
            const priceLine = lines[j + 1].trim();
            // Handle "$X.XX discounted from $Y.YY" format
            const discountMatch = priceLine.match(
              /^\$([\d.]+)\s+discounted from\s+\$([\d.]+)$/
            );
            if (discountMatch) {
              price = parseFloat(discountMatch[1]); // Use discounted price
            } else {
              // Handle plain "$X.XX" format
              const priceMatch = priceLine.match(/^\$([\d.]+)$/);
              if (priceMatch) {
                price = parseFloat(priceMatch[1]);
              }
            }
          }
          break;
        }

        // If we hit another product name (no $ and not a skip pattern), stop scanning
        if (
          !scanLine.startsWith("$") &&
          !skipPatterns.some((pattern) => pattern.test(scanLine)) &&
          scanLine.length > 2 &&
          !scanLine.startsWith("Received:") &&
          !scanLine.match(/^\d+$/)
        ) {
          // This might be the next product - check if it's not the duplicate
          if (scanLine !== productName) {
            break;
          }
        }

        j++;
      }

      // If we found a valid price, add the item
      if (price !== null && price > 0) {
        items.push({
          name: productName,
          price: price,
        });
      }

      // Move index past the "Received:" line and price
      i = j + 2;
    } else {
      i++;
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

// Parser for Costco format
// Format: [optional E] [item_code] [item_name] [price] [Y/N]
// E prefix = tax-exempt (not taxable), no E = taxable
// Discount lines: [code] / [parent_item_code] [discount]-
function parseCostcoGroceryList(text: string): ParsedItem[] {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const items: ParsedItem[] = [];

  // Map to track items by their code for applying discounts
  const itemsByCode: Map<
    string,
    { name: string; price: number; taxable: boolean; index: number }
  > = new Map();

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip footer lines
    if (
      trimmedLine.startsWith("SUBTOTAL") ||
      trimmedLine.startsWith("TAX") ||
      trimmedLine.startsWith("****") ||
      trimmedLine.startsWith("TOTAL")
    ) {
      continue;
    }

    // Check if this is a discount line (contains " / " followed by an item code)
    // Format: 366226    / 1489812    4.00-
    const discountMatch = trimmedLine.match(/^\d+\s+\/\s+(\d+)\s+([\d.]+)-$/);
    if (discountMatch) {
      const parentItemCode = discountMatch[1];
      const discountAmount = parseFloat(discountMatch[2]);

      // Apply discount to the parent item
      const parentItem = itemsByCode.get(parentItemCode);
      if (parentItem) {
        parentItem.price = parseFloat(
          (parentItem.price - discountAmount).toFixed(2)
        );
        // Update the item in the items array
        items[parentItem.index].price = parentItem.price;
      }
      continue;
    }

    // Parse regular item line
    // Format: [optional E] [item_code] [item_name] [price] [Y/N]
    // E prefix means tax-exempt (not taxable)
    // Examples:
    //    1489812    PUMA SOCK    14.99 Y     <- taxable (no E)
    // E    179571    COKEDEMEXICO    35.49 Y  <- not taxable (has E)
    // 512599    **KS TOWEL**    20.49 Y       <- taxable (no E)
    const itemMatch = trimmedLine.match(
      /^(E\s+)?(\d+)\s+(.+?)\s+([\d.]+)\s+[YN]$/
    );

    if (itemMatch) {
      const hasEPrefix = !!itemMatch[1];
      const itemCode = itemMatch[2];
      // Clean up item name - remove ** wrapper if present
      const rawName = itemMatch[3].trim();
      const name = rawName.replace(/^\*\*(.+)\*\*$/, "$1");
      const price = parseFloat(itemMatch[4]);
      // E prefix = tax-exempt (not taxable), no E = taxable
      const taxable = !hasEPrefix;

      const index = items.length;
      items.push({ name, price, taxable });
      itemsByCode.set(itemCode, { name, price, taxable, index });
    }
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

    // Create a new receipt with original text for future parser improvements
    const receiptResult = await userDb.createReceipt(source, undefined, text);
    const receiptId = Number(receiptResult.meta.last_row_id);

    // Process each item
    const items: GroceryItem[] = [];
    const uncategorizedItems: UncategorizedItem[] = [];

    for (const parsedItem of parsedItems) {
      const { name, price, taxable: parsedTaxable } = parsedItem;

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
        // For new items, use parsed taxable value if available, otherwise default to false
        const taxable = parsedTaxable ?? false;

        // Create new item without category
        const newItemResult = await userDb.createOrUpdateItem(
          name,
          price,
          source,
          undefined,
          taxable
        );

        const newItemId = Number(newItemResult.meta.last_row_id);

        // Add to receipt items
        await userDb.addReceiptItem(receiptId, newItemId, price, taxable);

        // Add to result
        items.push({
          id: newItemId,
          name,
          price,
          category_id: null,
          is_new: true,
          taxable,
        });

        // Add to uncategorized
        uncategorizedItems.push({
          id: newItemId,
          name,
          price,
          taxable,
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