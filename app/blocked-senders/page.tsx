"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BlockedSender {
  userId: string;
  accountId: string;
  senderEmail: string;
  senderDomain: string;
  blockedAt: string;
  ruleId?: string;
  ruleName?: string;
  unsubscribeMethod?: string;
  gmailFilterId?: string;
}

interface Account {
  accountId: string;
  email: string;
}

export default function BlockedSendersPage() {
  const [blockedSenders, setBlockedSenders] = useState<BlockedSender[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [unblockDialog, setUnblockDialog] = useState<{
    open: boolean;
    sender: BlockedSender | null;
  }>({ open: false, sender: null });
  const [unblocking, setUnblocking] = useState(false);

  useEffect(() => {
    fetchAccounts();
    fetchBlockedSenders();
  }, []);

  useEffect(() => {
    fetchBlockedSenders();
  }, [selectedAccount]);

  const fetchAccounts = async () => {
    try {
      const response = await fetch("/api/gmail/accounts");
      const data = await response.json();

      if (data.success) {
        setAccounts(data.accounts);
      }
    } catch (err) {
      console.error("Error fetching accounts:", err);
    }
  };

  const fetchBlockedSenders = async () => {
    try {
      setLoading(true);
      setError(null);

      const url =
        selectedAccount === "all"
          ? "/api/blocked-senders"
          : `/api/blocked-senders?accountId=${selectedAccount}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setBlockedSenders(data.blockedSenders);
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

  const handleUnblock = async () => {
    if (!unblockDialog.sender) return;

    try {
      setUnblocking(true);
      const response = await fetch(
        `/api/blocked-senders?accountId=${unblockDialog.sender.accountId}&senderEmail=${encodeURIComponent(
          unblockDialog.sender.senderEmail
        )}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (data.success) {
        setUnblockDialog({ open: false, sender: null });
        await fetchBlockedSenders();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert(`Error: ${message}`);
    } finally {
      setUnblocking(false);
    }
  };

  const filteredSenders = blockedSenders.filter((sender) => {
    const matchesSearch =
      sender.senderEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sender.senderDomain.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sender.ruleName?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch;
  });

  const getAccountEmail = (accountId: string) => {
    const account = accounts.find((acc) => acc.accountId === accountId);
    return account?.email || accountId;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Blocked Senders</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Manage senders that have been blocked and unsubscribed
              </p>
            </div>
            <Link href="/dashboard">
              <Button variant="outline">← Back to Dashboard</Button>
            </Link>
          </div>
        </div>

        {error && (
          <Alert className="mb-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
            <AlertDescription className="text-red-800 dark:text-red-200">
              Error: {error}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Blocked Senders ({filteredSenders.length})</CardTitle>
            <CardDescription>
              These senders have been blocked and their emails are automatically filtered
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search by email, domain, or rule name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="w-64">
                  <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                    <SelectTrigger>
                      <SelectValue placeholder="All accounts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All accounts</SelectItem>
                      {accounts.map((account) => (
                        <SelectItem key={account.accountId} value={account.accountId}>
                          {account.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Blocked senders list */}
              {loading ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Loading blocked senders...</p>
                </div>
              ) : filteredSenders.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-2">
                    {searchQuery || selectedAccount !== "all"
                      ? "No blocked senders match your filters"
                      : "No blocked senders yet"}
                  </p>
                  <p className="text-sm text-gray-400">
                    Senders will appear here when you use the "Block and unsubscribe" action in
                    your rules
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSenders.map((sender) => (
                    <div
                      key={`${sender.accountId}-${sender.senderEmail}`}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <p className="font-medium text-lg">{sender.senderEmail}</p>
                          <span className="text-sm text-gray-500">
                            ({sender.senderDomain})
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                          <span>
                            📧 Account: <strong>{getAccountEmail(sender.accountId)}</strong>
                          </span>
                          {sender.ruleName && (
                            <span>
                              📋 Rule: <strong>{sender.ruleName}</strong>
                            </span>
                          )}
                          <span>
                            🗓️ Blocked:{" "}
                            <strong>
                              {new Date(sender.blockedAt).toLocaleDateString()}
                            </strong>
                          </span>
                          {sender.unsubscribeMethod && (
                            <span>
                              🔄 Method:{" "}
                              <strong className={sender.unsubscribeMethod.includes("failed") ? "text-red-600" : ""}>
                                {sender.unsubscribeMethod}
                              </strong>
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setUnblockDialog({ open: true, sender })}
                      >
                        Unblock
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Unblock confirmation dialog */}
        <Dialog open={unblockDialog.open} onOpenChange={(open) => setUnblockDialog({ open, sender: null })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Unblock Sender</DialogTitle>
              <DialogDescription>
                Are you sure you want to unblock this sender? This will:
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <ul className="list-disc ml-6 space-y-2 text-sm">
                <li>Remove the Gmail filter blocking their emails</li>
                <li>Allow future emails from <strong>{unblockDialog.sender?.senderEmail}</strong> to reach your inbox</li>
                <li>Remove them from your blocked senders list</li>
              </ul>
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                Note: This will not re-subscribe you to their mailing list if you were unsubscribed.
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setUnblockDialog({ open: false, sender: null })}
                disabled={unblocking}
              >
                Cancel
              </Button>
              <Button onClick={handleUnblock} disabled={unblocking}>
                {unblocking ? "Unblocking..." : "Unblock Sender"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
