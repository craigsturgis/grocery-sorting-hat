import { useState } from "react";
import { useRouter } from "next/navigation";

interface GroceryParserProps {
  onParseComplete?: (receiptId: number) => void;
}

interface ParseResponse {
  receiptId: number;
  uncategorizedItems?: Array<{
    id: number;
    name: string;
    price: number;
  }>;
}

export default function GroceryParser({ onParseComplete }: GroceryParserProps) {
  const router = useRouter();
  const [groceryText, setGroceryText] = useState("");
  const [source, setSource] = useState("walmart");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!groceryText.trim()) {
      setError("Please enter your grocery list");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: groceryText,
          source: source,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || "Failed to parse grocery list");
      }

      const data = await response.json() as ParseResponse;
      setGroceryText("");

      // If there are uncategorized items, navigate to categorization page
      if (data.uncategorizedItems && data.uncategorizedItems.length > 0) {
        if (onParseComplete) {
          onParseComplete(data.receiptId);
        } else {
          router.push(`/receipts/${data.receiptId}`);
        }
      } else {
        router.push(`/receipts/${data.receiptId}`);
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An error occurred while parsing the grocery list");
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Grocery List Parser</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Source selection */}
        <div>
          <label
            htmlFor="source"
            className="block text-sm font-medium text-gray-700"
          >
            Grocery Store
          </label>
          <select
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          >
            <option value="walmart">Walmart</option>
            <option value="kroger">Kroger</option>
            <option value="costco">Costco</option>
            <option value="target">Target</option>
          </select>
        </div>

        {/* Grocery list input */}
        <div>
          <label
            htmlFor="groceryList"
            className="block text-sm font-medium text-gray-700"
          >
            Paste Your Grocery List
          </label>
          <textarea
            id="groceryList"
            rows={10}
            value={groceryText}
            onChange={(e) => setGroceryText(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Paste your grocery list here. One item per line, with price."
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="p-2 text-sm text-red-700 bg-red-100 rounded-md">
            {error}
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {loading ? "Processing..." : "Parse Grocery List"}
        </button>
      </form>
    </div>
  );
}
