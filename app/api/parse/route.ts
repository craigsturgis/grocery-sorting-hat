import { NextResponse } from "next/server";
import db from "../../../lib/db";
import { setupServer } from "../../../lib/serverSetup";

// Function to parse grocery list based on source
function parseGroceryList(
  text: string,
  source: string
): { name: string; price: number }[] {
  // Different parsing strategies based on store
  if (source === "kroger") {
    return parseKrogerGroceryList(text);
  } else {
    // Generic parser for other stores (Walmart, Target, etc.)
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
export async function POST(request: Request) {
  // Initialize the database before processing the request
  await setupServer();

  try {
    const { text, source } = await request.json();

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

    // Create a new receipt
    const insertReceipt = db.prepare(
      "INSERT INTO receipts (source) VALUES (?) RETURNING id"
    );
    const { id: receiptId } = insertReceipt.get(source) as { id: number };

    // Process each item
    const items: GroceryItem[] = [];
    const uncategorizedItems: UncategorizedItem[] = [];

    // Prepare statements
    const findItem = db.prepare(
      "SELECT id, category_id, taxable FROM items WHERE name = ?"
    );
    const insertItem = db.prepare(
      "INSERT INTO items (name, price, source, category_id, taxable) VALUES (?, ?, ?, ?, ?) RETURNING *"
    );
    const insertReceiptItem = db.prepare(
      "INSERT INTO receipt_items (receipt_id, item_id, price, taxable) VALUES (?, ?, ?, ?)"
    );

    // Start a transaction
    const transaction = db.transaction(() => {
      for (const { name, price } of parsedItems) {
        // Check if item exists
        const existingItem = findItem.get(name) as
          | { id: number; category_id: number | null; taxable: number }
          | undefined;

        if (existingItem) {
          // Use existing item
          const itemId = existingItem.id;

          // Add to receipt items
          insertReceiptItem.run(receiptId, itemId, price, existingItem.taxable);

          // Add to result
          items.push({
            id: itemId,
            name,
            price,
            category_id: existingItem.category_id,
            is_new: false,
            taxable: existingItem.taxable === 1,
          });

          // Check if uncategorized
          if (existingItem.category_id === null) {
            uncategorizedItems.push({
              id: itemId,
              name,
              price,
              taxable: existingItem.taxable === 1,
            });
          }
        } else {
          // Create new item without category
          const newItem = insertItem.get(name, price, source, null, 0) as {
            id: number;
            name: string;
            price: number;
            category_id: null;
            taxable: number;
          };

          // Add to receipt items
          insertReceiptItem.run(receiptId, newItem.id, price, 0);

          // Add to result
          items.push({
            ...newItem,
            is_new: true,
            taxable: false,
          });

          // Add to uncategorized
          uncategorizedItems.push({
            id: newItem.id,
            name: newItem.name,
            price: newItem.price,
            taxable: false,
          });
        }
      }
    });

    // Execute transaction
    transaction();

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
    return NextResponse.json(
      { error: "Failed to parse grocery list" },
      { status: 500 }
    );
  }
}
