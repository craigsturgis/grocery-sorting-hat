"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ItemCategorizer from "../../components/ItemCategorizer";
import ReceiptSummary from "../../components/ReceiptSummary";

export const runtime = "edge";

interface ReceiptPageProps {
  params: Promise<{ id: string }>;
}

export default function ReceiptPage({ params }: ReceiptPageProps) {
  const router = useRouter();
  const [showSummary, setShowSummary] = useState(false);
  const [receiptId, setReceiptId] = useState<number | null>(null);

  useEffect(() => {
    params.then((resolvedParams) => {
      const id = parseInt(resolvedParams.id, 10);
      setReceiptId(id);
    });
  }, [params]);

  if (receiptId === null) {
    return (
      <div className="min-h-screen p-4 md:p-8 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="p-4 text-center">Loading...</div>
        </div>
      </div>
    );
  }

  if (isNaN(receiptId)) {
    return (
      <div className="min-h-screen p-4 md:p-8 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="p-4 text-center bg-red-100 text-red-800 rounded-md">
            Invalid receipt ID
            <div className="mt-4">
              <button
                onClick={() => router.push("/")}
                className="px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white shadow-sm rounded-lg p-6">
          <div className="mb-4 flex justify-between items-center">
            <h1 className="text-2xl font-bold">Receipt #{receiptId}</h1>
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 text-indigo-700 bg-indigo-100 rounded-md hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Back to Home
            </button>
          </div>

          {!showSummary ? (
            <ItemCategorizer
              receiptId={receiptId}
              onComplete={() => setShowSummary(true)}
            />
          ) : (
            <ReceiptSummary receiptId={receiptId} />
          )}
        </div>
      </div>
    </div>
  );
}