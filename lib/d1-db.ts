import type { D1Database, KVNamespace } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  AUTH_SECRET: string;
  NEXTAUTH_URL: string;
}

// D1 Database wrapper with user context
export class UserDatabase {
  constructor(
    private db: D1Database,
    private userId: string
  ) {}

  // Categories
  async getCategories() {
    return await this.db
      .prepare("SELECT * FROM categories WHERE user_id = ? ORDER BY name")
      .bind(this.userId)
      .all();
  }

  async createCategory(name: string) {
    return await this.db
      .prepare("INSERT INTO categories (user_id, name) VALUES (?, ?)")
      .bind(this.userId, name)
      .run();
  }

  async deleteCategory(id: number) {
    return await this.db
      .prepare("DELETE FROM categories WHERE id = ? AND user_id = ?")
      .bind(id, this.userId)
      .run();
  }

  // Items
  async getItems() {
    return await this.db
      .prepare(`
        SELECT items.*, categories.name as category_name 
        FROM items 
        LEFT JOIN categories ON items.category_id = categories.id 
        WHERE items.user_id = ? 
        ORDER BY items.name
      `)
      .bind(this.userId)
      .all();
  }

  async getItemByName(name: string) {
    return await this.db
      .prepare("SELECT * FROM items WHERE user_id = ? AND name = ?")
      .bind(this.userId, name)
      .first();
  }

  async createOrUpdateItem(
    name: string,
    price: number,
    source: string,
    categoryId?: number,
    taxable?: boolean
  ) {
    const existingItem = await this.getItemByName(name);
    
    if (existingItem) {
      // Update existing item
      return await this.db
        .prepare(`
          UPDATE items 
          SET price = ?, source = ?, category_id = ?, taxable = ?
          WHERE user_id = ? AND name = ?
        `)
        .bind(price, source, categoryId || null, taxable ? 1 : 0, this.userId, name)
        .run();
    } else {
      // Create new item
      return await this.db
        .prepare(`
          INSERT INTO items (user_id, name, price, source, category_id, taxable) 
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(this.userId, name, price, source, categoryId || null, taxable ? 1 : 0)
        .run();
    }
  }

  async updateItemCategory(itemId: number, categoryId: number | null) {
    return await this.db
      .prepare("UPDATE items SET category_id = ? WHERE id = ? AND user_id = ?")
      .bind(categoryId, itemId, this.userId)
      .run();
  }

  async updateItemTaxable(itemId: number, taxable: boolean) {
    return await this.db
      .prepare("UPDATE items SET taxable = ? WHERE id = ? AND user_id = ?")
      .bind(taxable ? 1 : 0, itemId, this.userId)
      .run();
  }

  // Receipts
  async createReceipt(source: string, date?: string) {
    return await this.db
      .prepare("INSERT INTO receipts (user_id, source, date) VALUES (?, ?, ?)")
      .bind(this.userId, source, date || new Date().toISOString())
      .run();
  }

  async getReceipts() {
    return await this.db
      .prepare(`
        SELECT receipts.*, COUNT(receipt_items.id) as item_count, 
               SUM(receipt_items.price) as total
        FROM receipts
        LEFT JOIN receipt_items ON receipts.id = receipt_items.receipt_id
        WHERE receipts.user_id = ?
        GROUP BY receipts.id
        ORDER BY receipts.date DESC
      `)
      .bind(this.userId)
      .all();
  }

  async getReceiptById(id: number) {
    const receipt = await this.db
      .prepare("SELECT * FROM receipts WHERE id = ? AND user_id = ?")
      .bind(id, this.userId)
      .first();

    if (!receipt) return null;

    const items = await this.db
      .prepare(`
        SELECT 
          receipt_items.*, 
          items.name, 
          items.category_id,
          categories.name as category_name
        FROM receipt_items
        JOIN items ON receipt_items.item_id = items.id AND items.user_id = ?
        LEFT JOIN categories ON items.category_id = categories.id AND categories.user_id = ?
        WHERE receipt_items.receipt_id = ?
      `)
      .bind(this.userId, this.userId, id)
      .all();

    return { ...receipt, items: items.results };
  }

  async addReceiptItem(
    receiptId: number,
    itemId: number,
    price: number,
    taxable: boolean
  ) {
    return await this.db
      .prepare(`
        INSERT INTO receipt_items (receipt_id, item_id, price, taxable) 
        VALUES (?, ?, ?, ?)
      `)
      .bind(receiptId, itemId, price, taxable ? 1 : 0)
      .run();
  }

  // User management
  async ensureUser(email: string, name?: string) {
    const existing = await this.db
      .prepare("SELECT * FROM users WHERE id = ?")
      .bind(this.userId)
      .first();

    if (!existing) {
      await this.db
        .prepare("INSERT INTO users (id, email, name) VALUES (?, ?, ?)")
        .bind(this.userId, email, name || email)
        .run();
    }
  }
}