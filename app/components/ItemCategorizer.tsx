import { useState, useEffect } from "react";

interface Category {
  id: number;
  name: string;
}

interface Item {
  id: number;
  name: string;
  price: number;
  taxable?: boolean;
}

interface ReceiptItem {
  item_id: number;
  name: string;
  price: number;
  category_id?: number | null;
  category_name?: string | null;
  taxable: boolean;
}

interface ItemCategorizerProps {
  receiptId: number;
  onComplete?: () => void;
}

export default function ItemCategorizer({
  receiptId,
  onComplete,
}: ItemCategorizerProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [uncategorizedItems, setUncategorizedItems] = useState<Item[]>([]);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [taxableItems, setTaxableItems] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [categorizedCount, setCategorizedCount] = useState(0);

  // Fetch data on component mount
  useEffect(() => {
    fetchData();
  }, [receiptId]);

  // Fetch categories and uncategorized items
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch categories
      const categoriesResponse = await fetch("/api/categories");
      if (!categoriesResponse.ok) {
        throw new Error("Failed to fetch categories");
      }
      const categoriesData = await categoriesResponse.json() as Category[];
      setCategories(categoriesData);

      // Fetch receipt details
      const receiptResponse = await fetch(`/api/receipts/${receiptId}`);
      if (!receiptResponse.ok) {
        throw new Error("Failed to fetch receipt details");
      }
      const receiptData = await receiptResponse.json() as { items: ReceiptItem[] };

      // Set total items count
      setTotalItems(receiptData.items.length);
      
      console.log('Receipt data:', receiptData);
      console.log('Items:', receiptData.items);

      // Filter out uncategorized items
      const uncategorized = receiptData.items
        .filter((item: ReceiptItem) => item.category_id === null)
        .map((item: ReceiptItem) => ({
          id: item.item_id,
          name: item.name,
          price: item.price,
          taxable: item.taxable,
        }));
        
      console.log('Uncategorized items:', uncategorized);

      setUncategorizedItems(uncategorized);
      
      // Calculate categorized items count
      setCategorizedCount(receiptData.items.length - uncategorized.length);

      // Initialize taxable items
      setTaxableItems(
        uncategorized
          .filter((item: Item) => item.taxable)
          .map((item: Item) => item.id)
      );
      
      // Only show confirmation on initial load, not when reviewing
      if (uncategorized.length === 0 && showConfirmation === false) {
        setShowConfirmation(true);
      } else if (uncategorized.length > 0) {
        // Reset confirmation if we find uncategorized items
        setShowConfirmation(false);
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An error occurred while fetching data");
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Toggle item selection
  const toggleItemSelection = (itemId: number) => {
    if (selectedItems.includes(itemId)) {
      setSelectedItems(selectedItems.filter((id) => id !== itemId));
    } else {
      setSelectedItems([...selectedItems, itemId]);
    }
  };

  // Toggle taxable status for an item
  const toggleTaxableStatus = (itemId: number) => {
    if (taxableItems.includes(itemId)) {
      setTaxableItems(taxableItems.filter((id) => id !== itemId));
    } else {
      setTaxableItems([...taxableItems, itemId]);
    }

    // Update the taxable status in the database
    updateItemTaxableStatus(itemId);
  };

  // Update item taxable status in the database
  const updateItemTaxableStatus = async (itemId: number) => {
    try {
      const isTaxable = !taxableItems.includes(itemId);

      const response = await fetch("/api/items/taxable", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId,
          taxable: isTaxable,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update taxable status");
      }
    } catch (err) {
      console.error("Error updating taxable status:", err);
      // Don't show an error to the user, just log it
    }
  };

  // Select all items
  const selectAllItems = () => {
    if (selectedItems.length === uncategorizedItems.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(uncategorizedItems.map((item) => item.id));
    }
  };

  // Categorize selected items
  const categorizeItems = async () => {
    if (selectedItems.length === 0) {
      setError("Please select at least one item to categorize");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccessMessage(null);

      const response = await fetch("/api/items/categorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: selectedItems,
          categoryId: selectedCategory,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || "Failed to categorize items");
      }

      const categoryName = selectedCategory
        ? categories.find((c) => c.id === selectedCategory)?.name
        : "Uncategorized";

      setSuccessMessage(
        `Successfully categorized ${selectedItems.length} items as "${categoryName}"`
      );

      // Remove categorized items from list
      const remainingItems = uncategorizedItems.filter((item) => !selectedItems.includes(item.id));
      setUncategorizedItems(remainingItems);
      setSelectedItems([]);
      
      // Update categorized count
      setCategorizedCount(categorizedCount + selectedItems.length);

      // If all items are categorized, show confirmation
      if (remainingItems.length === 0) {
        setShowConfirmation(true);
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An error occurred while categorizing items");
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
  const formatPriceWithTax = (price: number) => {
    const priceWithTax = price * 1.07;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(priceWithTax);
  };


  if (showConfirmation) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Item Categorization</h2>
        <div className="p-4 text-center bg-green-100 text-green-800 rounded-md">
          All items have been categorized!
        </div>
        <div className="text-center text-sm text-gray-600">
          {categorizedCount} of {totalItems} items categorized
        </div>
        <div className="flex space-x-4">
          <button
            onClick={async () => {
              setShowConfirmation(false);
              setLoading(true);
              // Force a fresh fetch by clearing state first
              setUncategorizedItems([]);
              await fetchData();
            }}
            className="flex-1 px-4 py-2 text-indigo-700 bg-indigo-100 rounded-md hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Review Categorization
          </button>
          {onComplete && (
            <button
              onClick={onComplete}
              className="flex-1 px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              View Receipt Summary
            </button>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Item Categorization</h2>
        <div className="p-4 text-center bg-gray-100 text-gray-800 rounded-md">
          Loading items...
        </div>
      </div>
    );
  }
  
  // This shouldn't happen but just in case
  if (uncategorizedItems.length === 0 && !showConfirmation) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Item Categorization</h2>
        <div className="p-4 text-center bg-green-100 text-green-800 rounded-md">
          All items have been categorized!
        </div>
        <div className="text-center text-sm text-gray-600">
          {categorizedCount} of {totalItems} items categorized
        </div>
        {onComplete && (
          <button
            onClick={onComplete}
            className="w-full px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            View Receipt Summary
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-baseline">
        <h2 className="text-xl font-bold">Item Categorization</h2>
        <div className="text-sm text-gray-600">
          Progress: {categorizedCount} of {totalItems} items categorized
        </div>
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="p-2 text-sm text-green-700 bg-green-100 rounded-md">
          {successMessage}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-2 text-sm text-red-700 bg-red-100 rounded-md">
          {error}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:space-x-4 space-y-4 md:space-y-0">
        {/* Item selection */}
        <div className="md:w-2/3 space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">
              Uncategorized Items ({uncategorizedItems.length})
            </h3>
            <button
              onClick={selectAllItems}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              {selectedItems.length === uncategorizedItems.length
                ? "Deselect All"
                : "Select All"}
            </button>
          </div>

          <div className="border rounded-md overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Select
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Item
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
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {uncategorizedItems.map((item) => {
                  const isTaxable = taxableItems.includes(item.id);
                  return (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedItems.includes(item.id)}
                          onChange={() => toggleItemSelection(item.id)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <input
                          type="checkbox"
                          checked={isTaxable}
                          onChange={() => toggleTaxableStatus(item.id)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {isTaxable ? (
                          <div>
                            <div>{formatPrice(item.price)}</div>
                            <div className="text-xs text-green-600">
                              {formatPriceWithTax(item.price)} (with tax)
                            </div>
                          </div>
                        ) : (
                          formatPrice(item.price)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Category selection */}
        <div className="md:w-1/3 space-y-4">
          <h3 className="text-lg font-medium">Select Category</h3>

          <div className="space-y-2">
            <div className="space-y-2">
              {categories.map((category) => (
                <label
                  key={category.id}
                  className={`flex items-center space-x-2 p-2 rounded-md ${
                    selectedCategory === category.id
                      ? "bg-indigo-100 border border-indigo-300"
                      : "border"
                  }`}
                >
                  <input
                    type="radio"
                    name="category"
                    value={category.id}
                    checked={selectedCategory === category.id}
                    onChange={() => setSelectedCategory(category.id)}
                    className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <span>{category.name}</span>
                </label>
              ))}

              <label
                className={`flex items-center space-x-2 p-2 rounded-md ${
                  selectedCategory === null
                    ? "bg-indigo-100 border border-indigo-300"
                    : "border"
                }`}
              >
                <input
                  type="radio"
                  name="category"
                  checked={selectedCategory === null}
                  onChange={() => setSelectedCategory(null)}
                  className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                />
                <span>Leave Uncategorized</span>
              </label>
            </div>

            <button
              onClick={categorizeItems}
              disabled={selectedItems.length === 0 || loading}
              className="w-full px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading
                ? "Processing..."
                : `Categorize ${selectedItems.length} Items`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
