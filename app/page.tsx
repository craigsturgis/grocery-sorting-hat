"use client";

import { useState, useEffect } from "react";
import CategoryManager from "./components/CategoryManager";
import GroceryParser from "./components/GroceryParser";
import { useRouter } from "next/navigation";
import Image from "next/image";

type ActiveTab = "parser" | "categories" | "receipts";

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>("parser");
  const [loading, setLoading] = useState(true);

  // Check authentication on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Try to fetch categories as a way to check if authenticated
      const response = await fetch("/api/categories");
      if (response.status === 401) {
        router.push("/login");
      } else {
        setLoading(false);
      }
    } catch {
      router.push("/login");
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const navigateToReceipt = (receiptId: number) => {
    router.push(`/receipts/${receiptId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center justify-center mb-8 logo-container relative">
          {/* Logout button in top right */}
          <button
            onClick={handleLogout}
            className="absolute top-0 right-0 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
          >
            Logout
          </button>
          
          <Image
            src="/sorting-hat-logo.svg"
            alt="Grocery Sorting Hat Logo"
            width={120}
            height={120}
            className="mb-2"
          />
          <h1 className="text-3xl font-bold text-gray-900 text-center">
            Grocery Sorting Hat
          </h1>
        </div>

        {/* Tab navigation */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex">
            <button
              onClick={() => setActiveTab("parser")}
              className={`py-3 px-4 text-center border-b-2 font-medium text-sm ${
                activeTab === "parser"
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Parse Grocery List
            </button>
            <button
              onClick={() => setActiveTab("categories")}
              className={`ml-8 py-3 px-4 text-center border-b-2 font-medium text-sm ${
                activeTab === "categories"
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Manage Categories
            </button>
            <button
              onClick={() => setActiveTab("receipts")}
              className={`ml-8 py-3 px-4 text-center border-b-2 font-medium text-sm ${
                activeTab === "receipts"
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              View Receipts
            </button>
          </nav>
        </div>

        {/* Tab content */}
        <div className="bg-white shadow-sm rounded-lg p-6">
          {activeTab === "parser" && (
            <GroceryParser onParseComplete={navigateToReceipt} />
          )}

          {activeTab === "categories" && <CategoryManager />}

          {activeTab === "receipts" && <ReceiptList />}
        </div>
      </div>
    </main>
  );
}

// Receipt interface
interface Receipt {
  id: number;
  source: string;
  date: string;
  total_items: number;
  total_amount: number;
}

// Receipts list component
function ReceiptList() {
  const router = useRouter();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch receipts on component mount
  useEffect(() => {
    fetchReceipts();
  }, []);

  // Format price as currency
  const formatPrice = (price: number) => {
    if (typeof price !== "number") return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(price);
  };

  // Format date
  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  // Fetch all receipts
  const fetchReceipts = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/receipts");
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        throw new Error("Failed to fetch receipts");
      }
      const data = await response.json() as Receipt[];
      setReceipts(data);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Error loading receipts");
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading receipts...</div>;
  }

  if (error) {
    return (
      <div className="p-4 text-center bg-red-100 text-red-800 rounded-md">
        {error}
      </div>
    );
  }

  if (receipts.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">
          No receipts found. Parse your first grocery list to get started!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Recent Receipts</h2>

      <div className="border rounded-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                ID
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Store
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Date
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Items
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Total
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {receipts.map((receipt) => (
              <tr key={receipt.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  #{receipt.id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {receipt.source
                    ? receipt.source.charAt(0).toUpperCase() +
                      receipt.source.slice(1)
                    : "Unknown"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(receipt.date)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                  {receipt.total_items || 0}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                  {formatPrice(receipt.total_amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => router.push(`/receipts/${receipt.id}`)}
                    className="text-indigo-600 hover:text-indigo-900"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}