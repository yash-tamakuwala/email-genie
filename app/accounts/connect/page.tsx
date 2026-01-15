"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ConnectAccount() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");

  const handleConnect = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get auth URL from API
      const response = await fetch("/api/gmail/connect");
      const data = await response.json();

      if (data.success && data.authUrl) {
        // Redirect to Google OAuth
        window.location.href = data.authUrl;
      } else {
        setError(data.error || "Failed to initiate OAuth flow");
        setLoading(false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setLoading(false);
    }
  };

  const getErrorMessage = (errorCode: string | null) => {
    switch (errorCode) {
      case "access_denied":
        return "You denied access to your Gmail account. Please try again and grant the necessary permissions.";
      case "missing_parameters":
        return "OAuth callback is missing required parameters. Please try again.";
      case "invalid_state":
        return "Invalid OAuth state. This might be a security issue. Please try again.";
      case "token_exchange_failed":
        return "Failed to exchange authorization code for tokens. Please try again.";
      default:
        return errorCode ? `Authentication error: ${errorCode}` : null;
    }
  };

  const errorMessage = getErrorMessage(urlError) || error;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Link href="/dashboard">
            <Button variant="outline">← Back to Dashboard</Button>
          </Link>
        </div>

        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Connect Gmail Account</CardTitle>
              <CardDescription>
                Securely connect your Gmail account to enable email categorization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {errorMessage && (
                <Alert className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                  <AlertDescription className="text-red-800 dark:text-red-200">
                    {errorMessage}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h3 className="font-medium mb-2 text-blue-900 dark:text-blue-100">
                    What permissions are required?
                  </h3>
                  <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                    <li className="flex items-start gap-2">
                      <span>•</span>
                      <span><strong>Read emails:</strong> To analyze incoming messages</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span>•</span>
                      <span><strong>Modify emails:</strong> To apply labels and archive messages</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span>•</span>
                      <span><strong>Manage labels:</strong> To create and apply custom labels</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span>•</span>
                      <span><strong>View email address:</strong> To identify your account</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <Button
                    onClick={handleConnect}
                    disabled={loading}
                    className="w-full"
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <span className="mr-2">⏳</span>
                        Connecting...
                      </>
                    ) : (
                      <>
                        <span className="mr-2">🔗</span>
                        Connect with Google
                      </>
                    )}
                  </Button>

                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                    You&apos;ll be redirected to Google to authorize access
                  </p>
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="font-medium mb-3">Security & Privacy</h3>
                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <p>
                    ✓ We use OAuth 2.0 for secure authentication
                  </p>
                  <p>
                    ✓ Your credentials are never stored on our servers
                  </p>
                  <p>
                    ✓ You can revoke access at any time from your Google Account settings
                  </p>
                  <p>
                    ✓ All communication is encrypted with TLS
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">How It Works</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center font-bold text-blue-600 dark:text-blue-300">
                    1
                  </div>
                  <div>
                    <p className="font-medium">Authorize Access</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Grant Email Genie permission to access your Gmail
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center font-bold text-blue-600 dark:text-blue-300">
                    2
                  </div>
                  <div>
                    <p className="font-medium">Create Rules</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Define how you want your emails to be categorized
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center font-bold text-blue-600 dark:text-blue-300">
                    3
                  </div>
                  <div>
                    <p className="font-medium">Automatic Processing</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Incoming emails are automatically categorized based on your rules
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
