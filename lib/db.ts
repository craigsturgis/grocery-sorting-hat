import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "grocery-data.db");

// Initialize database connection
const db = new Database(dbPath);

// Setup tables if they don't exist
export function initDatabase() {
  // Create categories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  // Create items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      category_id INTEGER,
      source TEXT NOT NULL,
      taxable INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name),
      FOREIGN KEY(category_id) REFERENCES categories(id)
    )
  `);

  // Create receipts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create receipt_items table for storing items in a receipt
  db.exec(`
    CREATE TABLE IF NOT EXISTS receipt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      price REAL NOT NULL,
      taxable INTEGER DEFAULT 0,
      FOREIGN KEY(receipt_id) REFERENCES receipts(id),
      FOREIGN KEY(item_id) REFERENCES items(id)
    )
  `);

  // Add taxable column to items table if it doesn't exist
  try {
    // Check if taxable column exists in items table
    const hasItemTaxableColumn = db
      .prepare(
        `
      SELECT COUNT(*) as count 
      FROM pragma_table_info('items') 
      WHERE name='taxable'
    `
      )
      .get() as { count: number };

    if (hasItemTaxableColumn.count === 0) {
      console.log("Adding taxable column to items table");
      db.exec(`ALTER TABLE items ADD COLUMN taxable INTEGER DEFAULT 0`);
    }
  } catch (err) {
    console.error(
      "Error checking or adding taxable column to items table:",
      err
    );
  }

  // Add taxable column to receipt_items table if it doesn't exist
  try {
    // Check if taxable column exists in receipt_items table
    const hasReceiptItemTaxableColumn = db
      .prepare(
        `
      SELECT COUNT(*) as count 
      FROM pragma_table_info('receipt_items') 
      WHERE name='taxable'
    `
      )
      .get() as { count: number };

    if (hasReceiptItemTaxableColumn.count === 0) {
      console.log("Adding taxable column to receipt_items table");
      db.exec(`ALTER TABLE receipt_items ADD COLUMN taxable INTEGER DEFAULT 0`);
    }
  } catch (err) {
    console.error(
      "Error checking or adding taxable column to receipt_items table:",
      err
    );
  }
}

// Export database for use in API routes
export default db;
