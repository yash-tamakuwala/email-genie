"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EmailLog {
  emailId: string;
  accountId: string;
  messageId: string;
  sender: string;
  subject: string;
  body?: string;
  snippet?: string;
  appliedActions: string[];
  ruleMatched?: string;
  categorization?: string;
  processedAt: string;
}

interface GmailAccount {
  accountId: string;
  email: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [days, setDays] = useState<string>("7");
  const [selectedLog, setSelectedLog] = useState<EmailLog | null>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const accountParam = selectedAccountId === "all" ? "" : `&accountId=${selectedAccountId}`;
      const response = await fetch(`/api/logs?days=${days}${accountParam}`);
      const data = await response.json();
      
      if (data.success) {
        setLogs(data.logs || []);
        if (data.accounts) {
          setAccounts(data.accounts);
        }
      } else {
        setError(data.error || "Failed to fetch logs");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedAccountId, days]);

  const parseCategorizationData = (log: EmailLog) => {
    if (!log.categorization) return null;
    try {
      return JSON.parse(log.categorization);
    } catch {
      return null;
    }
  };

  const getActionBadgeVariant = (action: string) => {
    if (action.includes("important")) return "default";
    if (action.includes("archived")) return "secondary";
    if (action.includes("labels")) return "outline";
    return "outline";
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Email Processing Logs</h1>
            <p className="text-gray-600 dark:text-gray-400">
              View all processed emails and their categorization details
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

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4">
            <div className="flex-1">
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.accountId} value={account.accountId}>
                      {account.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 24 hours</SelectItem>
                  <SelectItem value="3">Last 3 days</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={fetchLogs} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                Loading logs...
              </CardContent>
            </Card>
          ) : logs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                No logs found for the selected filters
              </CardContent>
            </Card>
          ) : (
            logs.map((log) => {
              const categorizationData = parseCategorizationData(log);
              
              return (
                <Card 
                  key={log.emailId} 
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => setSelectedLog(log)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <CardTitle className="text-base mb-1">{log.subject}</CardTitle>
                        <CardDescription className="text-sm">
                          From: {log.sender}
                        </CardDescription>
                      </div>
                      <div className="text-right text-sm text-gray-500">
                        {new Date(log.processedAt).toLocaleString()}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {log.snippet && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                          {log.snippet}
                        </p>
                      )}
                      
                      <div className="flex flex-wrap gap-2">
                        {log.appliedActions.map((action, idx) => (
                          <Badge key={idx} variant={getActionBadgeVariant(action)}>
                            {action}
                          </Badge>
                        ))}
                      </div>
                      
                      {log.ruleMatched && (
                        <p className="text-xs text-gray-500 italic">
                          Reason: {log.ruleMatched}
                        </p>
                      )}
                      
                      {categorizationData && (
                        <div className="text-xs text-gray-500 mt-2">
                          <div>Important: {categorizationData.shouldMarkImportant ? "Yes" : "No"}</div>
                          <div>Skip Inbox: {categorizationData.shouldSkipInbox ? "Yes" : "No"}</div>
                          {categorizationData.suggestedLabels?.length > 0 && (
                            <div>Labels: {categorizationData.suggestedLabels.join(", ")}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedLog?.subject}</DialogTitle>
            <DialogDescription>
              From: {selectedLog?.sender} • {selectedLog && new Date(selectedLog.processedAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Email Content</h3>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {selectedLog.body || selectedLog.snippet || "No content available"}
                </div>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Applied Actions</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedLog.appliedActions.map((action, idx) => (
                    <Badge key={idx} variant={getActionBadgeVariant(action)}>
                      {action}
                    </Badge>
                  ))}
                </div>
              </div>
              
              {selectedLog.ruleMatched && (
                <div>
                  <h3 className="font-semibold mb-2">Rule Reasoning</h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {selectedLog.ruleMatched}
                  </p>
                </div>
              )}
              
              {selectedLog.categorization && (
                <div>
                  <h3 className="font-semibold mb-2">Full Categorization Data</h3>
                  <pre className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md text-xs overflow-x-auto">
                    {JSON.stringify(parseCategorizationData(selectedLog), null, 2)}
                  </pre>
                </div>
              )}
              
              <div className="text-xs text-gray-500">
                <div>Email ID: {selectedLog.emailId}</div>
                <div>Message ID: {selectedLog.messageId}</div>
                <div>Account ID: {selectedLog.accountId}</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
