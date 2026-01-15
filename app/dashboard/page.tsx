"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface Account {
  accountId: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

function DashboardContent() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected");

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/gmail/accounts");
      const data = await response.json();

      if (data.success) {
        setAccounts(data.accounts);
      } else {
        setError(data.error);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm("Are you sure you want to disconnect this account?")) {
      return;
    }

    try {
      const response = await fetch(`/api/gmail/accounts?accountId=${accountId}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (data.success) {
        await fetchAccounts();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert(`Error: ${message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Manage your connected Gmail accounts and categorization rules
              </p>
            </div>
            <Link href="/">
              <Button variant="outline">← Back to Home</Button>
            </Link>
          </div>
        </div>

        {connected && (
          <Alert className="mb-6 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
            <AlertDescription className="text-green-800 dark:text-green-200">
              ✓ Gmail account connected successfully!
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="mb-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
            <AlertDescription className="text-red-800 dark:text-red-200">
              Error: {error}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Connected Accounts</CardTitle>
              <CardDescription>Gmail accounts linked to Email Genie</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-gray-500">Loading accounts...</p>
              ) : accounts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">No accounts connected yet</p>
                  <Link href="/accounts/connect">
                    <Button>Connect Gmail Account</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {accounts.map((account) => (
                    <div
                      key={account.accountId}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                          {account.email[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{account.email}</p>
                          <p className="text-sm text-gray-500">
                            Connected {new Date(account.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Link href="/rules">
                          <Button size="sm" variant="outline">
                            Manage Rules
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteAccount(account.accountId)}
                        >
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="pt-3">
                    <Link href="/accounts/connect">
                      <Button variant="outline" className="w-full">
                        + Add Another Account
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks and settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/accounts/connect">
                <Button className="w-full justify-start" variant="outline">
                  🔗 Connect New Account
                </Button>
              </Link>
              {accounts.length > 0 && (
                <Link href="/rules">
                  <Button className="w-full justify-start" variant="outline">
                    ⚙️ Configure Rules
                  </Button>
                </Link>
              )}
              <Link href="/jobs">
                <Button className="w-full justify-start" variant="outline">
                  🧭 Job Monitor
                </Button>
              </Link>
              <Button className="w-full justify-start" variant="outline" disabled>
                📊 View Activity Logs
              </Button>
              <Button className="w-full justify-start" variant="outline" disabled>
                🔔 Notification Settings
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>Follow these steps to set up email categorization</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Badge className="mt-1">{accounts.length > 0 ? "✓" : "1"}</Badge>
                <div>
                  <p className="font-medium">Connect Gmail Account</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Link your Gmail account using secure OAuth 2.0
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Badge className="mt-1" variant="outline">
                  2
                </Badge>
                <div>
                  <p className="font-medium">Create Categorization Rules</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Define how emails should be categorized and labeled
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Badge className="mt-1" variant="outline">
                  3
                </Badge>
                <div>
                  <p className="font-medium">Background Processing</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Emails are processed automatically every few minutes
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Badge className="mt-1" variant="outline">
                  4
                </Badge>
                <div>
                  <p className="font-medium">Test & Monitor</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Send test emails and monitor the categorization results
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
