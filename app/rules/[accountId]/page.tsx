"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// This page has been deprecated in favor of global rules
// Redirect to the global rules page
export default function AccountRulesRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/rules");
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-600">Redirecting to global rules...</p>
      </div>
    </div>
  );
}
