# Grocery Sorting Hat

A web application that helps categorize and analyze your grocery expenses. The app allows you to paste in grocery lists from various stores, categorize items, and see a breakdown of expenses by category.

## Features

- Parse grocery lists from Walmart, Kroger, and Target
- Manage custom categories for your groceries
- Automatic categorization of previously categorized items
- View detailed receipt summaries with category breakdown
- Track spending across categories

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
# or
yarn install
```

3. Start the development server:

```bash
npm run dev
# or
yarn dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Usage

1. **Manage Categories**: First, create categories for your groceries (e.g., Produce, Dairy, Meat, etc.)
2. **Parse Grocery Lists**: Paste your grocery list from a supported retailer and submit
3. **Categorize Items**: Assign categories to new items that haven't been categorized before
4. **View Summaries**: See how much you're spending in each category

### Data Format

The application expects grocery lists in a format similar to:

```
Item Name $Price
Another Item $Price
```

## Technical Details

- Built with Next.js and React
- Uses SQLite for data storage
- Tailwind CSS for styling
- TypeScript for type safety

## License

MIT
