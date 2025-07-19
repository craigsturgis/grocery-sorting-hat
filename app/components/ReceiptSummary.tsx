import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface CategoryTotal {
  id: number | null;
  name: string;
  total: number;
  totalTax: number;
  totalWithTax: number;
  count: number;
}

interface ReceiptItem {
  receipt_item_id: number;
  price: number;
  item_id: number;
  name: string;
  category_id: number | null;
  category_name: string | null;
  taxable: boolean;
}

interface Receipt {
  id: number;
  source: string;
  date: string;
  items: ReceiptItem[];
  categoryTotals: CategoryTotal[];
  totalAmount: number;
  totalTax: number;
}

interface ReceiptSummaryProps {
  receiptId: number;
}

export default function ReceiptSummary({ receiptId }: ReceiptSummaryProps) {
  const router = useRouter();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "items">("summary");
  const [taxUpdating, setTaxUpdating] = useState<number | null>(null);
  const [uncategorizingItem, setUncategorizingItem] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch receipt data on component mount
  useEffect(() => {
    fetchReceipt();
  }, [receiptId]);

  // Fetch receipt details
  const fetchReceipt = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/receipts/${receiptId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch receipt details");
      }
      const data = await response.json() as Receipt;

      // Calculate tax amounts if not provided by the API
      if (data && !data.totalTax) {
        data.totalTax = data.items.reduce((sum: number, item: ReceiptItem) => {
          return sum + (item.taxable ? item.price * 0.07 : 0);
        }, 0);
      }

      setReceipt(data);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Error loading receipt");
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Format price as currency
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(price);
  };

  // Format price with tax
  const formatPriceWithTax = (price: number, taxable: boolean) => {
    if (!taxable) return formatPrice(price);

    const priceWithTax = price * 1.07;
    return formatPrice(priceWithTax);
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Toggle taxable status for an item
  const toggleTaxableStatus = async (
    itemId: number,
    currentStatus: boolean
  ) => {
    if (taxUpdating === itemId) return; // Prevent double clicks

    try {
      setTaxUpdating(itemId);

      const response = await fetch("/api/items/taxable", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId,
          taxable: !currentStatus,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update taxable status");
      }

      // Update local state
      if (receipt) {
        const newItems = receipt.items.map((item) =>
          item.item_id === itemId ? { ...item, taxable: !currentStatus } : item
        );

        // Recalculate total tax based on updated items
        const newTotalTax = newItems.reduce(
          (sum, item) => sum + (item.taxable ? item.price * 0.07 : 0),
          0
        );

        setReceipt({
          ...receipt,
          items: newItems,
          totalTax: newTotalTax,
        });
      }
    } catch (err) {
      console.error("Error updating taxable status:", err);
    } finally {
      setTaxUpdating(null);
    }
  };

  // Reset categorization for an item
  const resetCategorization = async (itemId: number) => {
    if (uncategorizingItem === itemId) return; // Prevent double clicks

    try {
      setUncategorizingItem(itemId);

      const response = await fetch("/api/items/uncategorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to reset categorization");
      }

      // Recalculate category totals
      await fetchReceipt();
      
      // Show success message
      setSuccessMessage("Item categorization reset. You can re-categorize it from the categorization screen.");
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error("Error resetting categorization:", err);
      setError("Failed to reset item categorization");
    } finally {
      setUncategorizingItem(null);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading receipt data...</div>;
  }

  if (error) {
    return (
      <div className="p-4 text-center bg-red-100 text-red-800 rounded-md">
        {error}
        <div className="mt-4">
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="p-4 text-center bg-red-100 text-red-800 rounded-md">
        Receipt not found
        <div className="mt-4">
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // Calculate total with tax
  const totalWithTax = receipt.totalAmount + receipt.totalTax;

  return (
    <div className="space-y-6">
      {/* Success message */}
      {successMessage && (
        <div className="p-3 text-sm text-green-700 bg-green-100 rounded-md">
          {successMessage}
        </div>
      )}
      
      <div className="border-b pb-6">
        <h2 className="text-2xl font-bold">Receipt #{receipt.id}</h2>
        <div className="mt-2 flex flex-col md:flex-row justify-between text-gray-600">
          <div>
            <span className="font-medium">Store:</span>{" "}
            {receipt.source.charAt(0).toUpperCase() + receipt.source.slice(1)}
          </div>
          <div>
            <span className="font-medium">Date:</span>{" "}
            {formatDate(receipt.date)}
          </div>
          <div>
            <span className="font-medium">Subtotal:</span>{" "}
            {formatPrice(receipt.totalAmount)}
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <div className="text-right">
            <div>
              <span className="font-medium">Tax (7%):</span>{" "}
              {formatPrice(receipt.totalTax)}
            </div>
            <div className="text-lg font-bold">
              <span>Total:</span> {formatPrice(totalWithTax)}
            </div>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="border-b">
        <nav className="-mb-px flex">
          <button
            onClick={() => setActiveTab("summary")}
            className={`py-2 px-4 text-center border-b-2 font-medium text-sm ${
              activeTab === "summary"
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Category Summary
          </button>
          <button
            onClick={() => setActiveTab("items")}
            className={`ml-8 py-2 px-4 text-center border-b-2 font-medium text-sm ${
              activeTab === "items"
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            All Items
          </button>
        </nav>
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === "summary" ? (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">Category Breakdown</h3>

            {/* Category chart - Simple bar visualization */}
            <div className="space-y-4">
              {receipt.categoryTotals.map((category) => {
                // Use new fields if available, otherwise calculate
                const categoryTax = category.totalTax ?? receipt.items
                  .filter(
                    (item) =>
                      item.category_id === category.id ||
                      (category.id === null && item.category_id === null)
                  )
                  .reduce(
                    (sum, item) => sum + (item.taxable ? item.price * 0.07 : 0),
                    0
                  );

                const totalWithTax = category.totalWithTax ?? (category.total + categoryTax);

                return (
                  <div key={category.id ?? "uncategorized"}>
                    <div className="flex justify-between items-center mb-1">
                      <div className="font-medium">{category.name}</div>
                      <div className="text-gray-700 text-right">
                        <div>{formatPrice(category.total)} (pre-tax)</div>
                        {categoryTax > 0 && (
                          <div className="text-green-600 text-sm">
                            {formatPrice(totalWithTax)} (with tax)
                          </div>
                        )}
                        <div className="text-xs">{category.count} items</div>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-indigo-600 h-2.5 rounded-full"
                        style={{
                          width: `${
                            (totalWithTax /
                              (receipt.totalAmount + receipt.totalTax)) *
                            100
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">All Items</h3>

            <div className="border rounded-md overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Item
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Category
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Taxable
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Price
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {receipt.items.map((item) => (
                    <tr key={item.receipt_item_id}>
                      <td className="px-6 py-4 text-sm text-gray-900 break-words">
                        {item.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {item.category_name || "Uncategorized"}
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <div className="flex justify-center items-center">
                          <input
                            type="checkbox"
                            checked={!!item.taxable}
                            onChange={() =>
                              toggleTaxableStatus(item.item_id, !!item.taxable)
                            }
                            disabled={taxUpdating === item.item_id}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 text-right">
                        {!!item.taxable ? (
                          <div>
                            <div>{formatPrice(item.price)}</div>
                            <div className="text-xs text-green-600">
                              {formatPriceWithTax(item.price, true)} (with tax)
                            </div>
                          </div>
                        ) : (
                          formatPrice(item.price)
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <button
                          onClick={() => resetCategorization(item.item_id)}
                          disabled={uncategorizingItem === item.item_id || !item.category_id}
                          className={`px-3 py-1 text-xs rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                            item.category_id
                              ? "text-red-700 bg-red-100 hover:bg-red-200 focus:ring-red-500"
                              : "text-gray-400 bg-gray-100 cursor-not-allowed"
                          }`}
                          title={item.category_id ? "Reset categorization" : "Already uncategorized"}
                        >
                          {uncategorizingItem === item.item_id ? "..." : "Reset"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 text-indigo-700 bg-indigo-100 rounded-md hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
