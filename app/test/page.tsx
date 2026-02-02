"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Account {
  accountId: string;
  email: string;
}

interface CategorizationResult {
  shouldMarkImportant: boolean;
  shouldPinConversation: boolean;
  shouldSkipInbox: boolean;
  shouldMarkReadAndLabel: boolean;
  suggestedLabels: string[];
  reasoning: string;
  confidence: number;
}

export default function TestCategorizationPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [snippet, setSnippet] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<CategorizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        setLoadingAccounts(true);
        const response = await fetch("/api/gmail/accounts");
        const data = await response.json();

        if (data.success) {
          setAccounts(data.accounts);
          if (data.accounts.length > 0) {
            setAccountId(data.accounts[0].accountId);
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
      } finally {
        setLoadingAccounts(false);
      }
    };

    fetchAccounts();
  }, []);

  const actions = useMemo(() => {
    if (!result) return [];

    const nextActions: string[] = [];
    if (result.shouldMarkImportant) nextActions.push("Mark as important");
    if (result.shouldPinConversation) nextActions.push("Pin conversation");
    if (result.shouldSkipInbox) nextActions.push("Archive (skip inbox)");
    if (result.shouldMarkReadAndLabel) nextActions.push("Mark as read & move to label");
    if (result.suggestedLabels.length > 0) {
      nextActions.push(`Apply labels: ${result.suggestedLabels.join(", ")}`);
    }

    if (nextActions.length === 0) {
      nextActions.push("No actions (rules did not match)");
    }

    return nextActions;
  }, [result]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/categorize/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          from,
          subject,
          snippet,
          body,
        }),
      });
      const data = await response.json();

      if (data.success) {
        setResult(data.categorization);
      } else {
        setError(data.error || "Failed to categorize email");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Test Categorization</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Send a sample email through your rules and review the AI output.
            </p>
          </div>
          <Link href="/dashboard">
            <Button variant="outline">← Back to Dashboard</Button>
          </Link>
        </div>

        {error && (
          <Alert className="mb-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
            <AlertDescription className="text-red-800 dark:text-red-200">
              Error: {error}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Sample Email</CardTitle>
              <CardDescription>Provide the email details you want to test.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Account</label>
                  <select
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800"
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                    disabled={loadingAccounts || accounts.length === 0}
                  >
                    {accounts.length === 0 ? (
                      <option value="">No accounts connected</option>
                    ) : (
                      accounts.map((account) => (
                        <option key={account.accountId} value={account.accountId}>
                          {account.email}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">From</label>
                  <Input
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                    placeholder="sender@example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Subject</label>
                  <Input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="Subject line"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Snippet</label>
                  <Input
                    value={snippet}
                    onChange={(event) => setSnippet(event.target.value)}
                    placeholder="Short preview text (optional)"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Body</label>
                  <Textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Paste the email body here"
                    rows={8}
                  />
                </div>
                <Button type="submit" disabled={loading || accounts.length === 0} className="w-full">
                  {loading ? "Running..." : "Run Test"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Result</CardTitle>
              <CardDescription>Review the AI decision based on your rules.</CardDescription>
            </CardHeader>
            <CardContent>
              {!result ? (
                <p className="text-sm text-gray-500">
                  Submit a sample email to see the categorization output.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Confidence</Badge>
                    <span className="text-sm font-medium">{Math.round(result.confidence * 100)}%</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Matched Rule</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{result.reasoning}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Actions</p>
                    <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                      {actions.map((action) => (
                        <li key={action} className="flex items-center gap-2">
                          <span className="text-green-600">•</span>
                          {action}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-md bg-gray-900 text-gray-100 p-4 text-xs overflow-auto">
                    <pre>{JSON.stringify(result, null, 2)}</pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
