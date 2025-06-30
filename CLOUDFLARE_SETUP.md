# Cloudflare Setup Guide

This guide will help you deploy the Grocery Sorting Hat to Cloudflare Pages with D1 database and authentication.

## Prerequisites

1. A Cloudflare account
2. Wrangler CLI installed (`npm install -g wrangler`)
3. Node.js 18+ installed

## Setup Steps

### 1. Authenticate with Cloudflare

```bash
npx wrangler login
```

### 2. Create D1 Database

```bash
npm run db:create
```

This will create a D1 database named `grocery-sorting-hat`. Note the database ID from the output - you'll need to update it in `wrangler.toml`.

### 3. Update wrangler.toml

Replace `YOUR_DATABASE_ID` in `wrangler.toml` with the actual database ID from step 2.

### 4. Create KV Namespace for Sessions

```bash
npx wrangler kv:namespace create SESSIONS
```

Note the namespace ID and update it in `wrangler.toml`.

### 5. Run Database Migrations

For local development:
```bash
npm run db:migrate
```

For production:
```bash
npm run db:migrate:prod
```

### 6. Set Environment Variables

Generate a secure auth secret:
```bash
openssl rand -base64 32
```

Update the `wrangler.toml` file with:
- `AUTH_SECRET` - The generated secret
- `NEXTAUTH_URL` - Your Cloudflare Pages URL (e.g., https://grocery-sorting-hat.pages.dev)

### 7. Import Existing SQLite Data (Optional)

If you have existing data in a SQLite database:

```bash
npm run db:import ./grocery-data.db your-email@example.com
```

This will import all data from the SQLite database and assign it to the specified user email.

### 8. Build for Cloudflare Pages

```bash
npm run build
npm run pages:build
```

### 9. Deploy to Cloudflare Pages

```bash
npm run deploy
```

## Local Development with Cloudflare

To test with Cloudflare's environment locally:

```bash
npm run preview
```

## Authentication Flow

1. Users visit the app and are redirected to `/login` if not authenticated
2. New users can register at `/register`
3. User passwords are hashed with bcrypt and stored in KV storage
4. Each user's data is isolated in the database using their user ID
5. Sessions are managed with JWT tokens stored in httpOnly cookies

## Database Structure

Each user has their own isolated data:
- Categories are user-specific
- Items are user-specific
- Receipts are user-specific
- All queries filter by user_id automatically

## Security Notes

1. Always use HTTPS in production
2. Keep your AUTH_SECRET secure and never commit it to version control
3. Regular backups of your D1 database are recommended
4. Consider implementing rate limiting for authentication endpoints

## Troubleshooting

### Database Connection Issues
- Ensure your database ID is correctly set in wrangler.toml
- Check that migrations have been run successfully

### Authentication Issues
- Verify AUTH_SECRET is set correctly
- Check that cookies are enabled in the browser
- Ensure NEXTAUTH_URL matches your deployment URL

### Deployment Issues
- Make sure you're using the correct Node.js version (18+)
- Check that all dependencies are installed
- Verify wrangler is authenticated with your Cloudflare account