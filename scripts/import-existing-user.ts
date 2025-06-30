#!/usr/bin/env tsx

import Database from "better-sqlite3";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

// Configuration
const SQLITE_DB_PATH = process.argv[2] || "./grocery-data.db";
const USER_ID = process.argv[3];
const D1_DATABASE_NAME = "grocery-sorting-hat";

if (!USER_ID) {
  console.error("Usage: tsx import-existing-user.ts [sqlite-db-path] <user-id>");
  process.exit(1);
}

// Open SQLite database
const db = new Database(SQLITE_DB_PATH, { readonly: true });

console.log(`Importing data for existing user: ${USER_ID}`);

// Create temporary SQL file for import
const tempSqlFile = path.join(process.cwd(), `import-${Date.now()}.sql`);
const sqlStatements: string[] = [];

// Import categories
const categories = db.prepare("SELECT * FROM categories").all() as Array<{
  id: number;
  name: string;
}>;

const categoryIdMap = new Map<number, number>();
categories.forEach((cat, index) => {
  const newId = index + 1;
  categoryIdMap.set(cat.id, newId);
  sqlStatements.push(
    `INSERT INTO categories (id, user_id, name) VALUES (${newId}, '${USER_ID}', '${cat.name.replace(/'/g, "''")}');`
  );
});

// Import items
const items = db.prepare("SELECT * FROM items").all() as Array<{
  id: number;
  name: string;
  price: number;
  category_id: number | null;
  source: string;
  taxable: number;
  created_at: string;
}>;

const itemIdMap = new Map<number, number>();
items.forEach((item, index) => {
  const newId = index + 1;
  itemIdMap.set(item.id, newId);
  const newCategoryId = item.category_id ? categoryIdMap.get(item.category_id) || null : null;
  
  sqlStatements.push(
    `INSERT INTO items (id, user_id, name, price, category_id, source, taxable, created_at) VALUES (${newId}, '${USER_ID}', '${item.name.replace(/'/g, "''")}', ${item.price}, ${newCategoryId}, '${item.source}', ${item.taxable}, '${item.created_at}');`
  );
});

// Import receipts
const receipts = db.prepare("SELECT * FROM receipts").all() as Array<{
  id: number;
  source: string;
  date: string;
}>;

const receiptIdMap = new Map<number, number>();
receipts.forEach((receipt, index) => {
  const newId = index + 1;
  receiptIdMap.set(receipt.id, newId);
  
  sqlStatements.push(
    `INSERT INTO receipts (id, user_id, source, date) VALUES (${newId}, '${USER_ID}', '${receipt.source}', '${receipt.date}');`
  );
});

// Import receipt items
const receiptItems = db.prepare("SELECT * FROM receipt_items").all() as Array<{
  id: number;
  receipt_id: number;
  item_id: number;
  price: number;
  taxable: number;
}>;

receiptItems.forEach((ri, index) => {
  const newReceiptId = receiptIdMap.get(ri.receipt_id);
  const newItemId = itemIdMap.get(ri.item_id);
  
  if (newReceiptId && newItemId) {
    const newId = index + 1;
    sqlStatements.push(
      `INSERT INTO receipt_items (id, receipt_id, item_id, price, taxable) VALUES (${newId}, ${newReceiptId}, ${newItemId}, ${ri.price}, ${ri.taxable});`
    );
  }
});

// Write SQL statements to temporary file
fs.writeFileSync(tempSqlFile, sqlStatements.join("\n"));

console.log(`Created import file with ${sqlStatements.length} statements`);
console.log(`Categories: ${categories.length}`);
console.log(`Items: ${items.length}`);
console.log(`Receipts: ${receipts.length}`);
console.log(`Receipt Items: ${receiptItems.length}`);

// Execute import using wrangler
try {
  console.log("Executing import to remote D1...");
  execSync(`npx wrangler d1 execute ${D1_DATABASE_NAME} --remote --file=${tempSqlFile}`, {
    stdio: "inherit",
  });
  console.log("Import completed successfully!");
} catch (error) {
  console.error("Import failed:", error);
} finally {
  // Clean up temporary file
  fs.unlinkSync(tempSqlFile);
}

// Close database
db.close();