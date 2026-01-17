# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run dev` - Start development server at http://localhost:3000
- `npm run build` - Build for production
- `npm run lint` - Run ESLint

### Cloudflare Deployment
- `npm run pages:build` - Build for Cloudflare Pages
- `npm run preview` - Preview Cloudflare build locally
- `npm run deploy` - Deploy to Cloudflare Pages

**Production deployment workflow:**
1. `npm run pages:build` - Build the app for Cloudflare
2. `npm run deploy` - Deploy to Cloudflare Pages via wrangler
3. `npm run db:migrate:prod` - Run any new migrations (if schema changed)

### Database (Cloudflare D1)
- `npm run db:migrate` - Run migrations locally
- `npm run db:migrate:prod` - Run migrations in production
- `npm run db:import` - Import SQLite data to D1

## Architecture

### Tech Stack
- **Next.js 15** with App Router (all routes use edge runtime)
- **React 19** with TypeScript
- **Cloudflare D1** for production database, **SQLite** for local dev
- **jose** for JWT authentication (edge-compatible alternative to jsonwebtoken)
- **Tailwind CSS 4** for styling

### Key Architecture Decisions

**Edge Runtime**: All API routes use `export const runtime = "edge"` for Cloudflare compatibility. Use `jose` instead of `jsonwebtoken`, and access D1/KV through `getCloudflareEnv()`.

**User Data Isolation**: All database tables include `user_id` foreign key. The `UserDatabase` class in `lib/d1-db.ts` wraps all queries with automatic user filtering. Every API route calls `requireAuth()` to get the authenticated user before any database operations.

**Authentication Flow**: JWT tokens (HS256, 7-day expiry) stored in httpOnly cookies. `lib/auth-helpers.ts` provides `getUser()`, `requireAuth()`, and `createAuthToken()` functions.

### API Routes (`app/api/`)

| Route | Purpose |
|-------|---------|
| `/api/auth/*` | Login, logout, register endpoints |
| `/api/parse` | Parse receipt text from supported stores |
| `/api/categories` | CRUD for user's grocery categories |
| `/api/items/categorize` | Assign categories to items |
| `/api/items/taxable` | Update item taxable status |
| `/api/receipts` | List receipts / create new receipt |
| `/api/receipts/[id]` | Get receipt details with items |

### Receipt Parsing (`app/api/parse/route.ts`)

Supports four store formats with different parsing strategies:
- **Kroger** - "Received: X Paid:" markers, discount handling
- **Walmart** - Multi-line with quantity and unit prices
- **Costco** - Item codes, E-prefix = tax-exempt
- **Target** - Generic fallback parser

The parser auto-categorizes items that have been categorized before, creates a receipt record, and returns uncategorized items for user assignment.

### Database Schema (`migrations/0001_initial_schema.sql`)

Five tables with user isolation:
- `users` - User accounts
- `categories` - User-specific grocery categories
- `items` - Grocery items with category assignment and taxable flag
- `receipts` - Receipt metadata (source store, date)
- `receipt_items` - Items in each receipt with price and taxable status

### React Components (`app/components/`)

All components use `"use client"` directive:
- `GroceryParser.tsx` - Main UI for pasting/parsing receipts
- `CategoryManager.tsx` - Create/delete categories
- `ItemCategorizer.tsx` - Assign categories to uncategorized items
- `ReceiptSummary.tsx` - Display receipt breakdown by category

## Development Notes

- No automated test framework is currently set up
- Manual parser testing available via `test-parser.js`
- Passwords stored in Cloudflare KV, hashed with bcryptjs
- Environment bindings configured in `wrangler.toml`
