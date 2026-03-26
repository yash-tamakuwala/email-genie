"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AttachmentInfo {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface SearchResult {
  accountId: string;
  accountEmail: string;
  messageId: string;
  subject: string;
  sender: string;
  date: string;
  snippet: string;
  attachments: AttachmentInfo[];
  confidence: number;
  reasoning: string;
  matchedQuery?: string;
  passwordHint?: string | null;
}

interface Account {
  accountId: string;
  email: string;
}

type PageState = "idle" | "searching" | "results" | "downloading" | "error";

export default function DocumentsPage() {
  const [queries, setQueries] = useState<string[]>([""]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [pageState, setPageState] = useState<PageState>("idle");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedAttachments, setSelectedAttachments] = useState<
    Set<string>
  >(new Set());
  const [error, setError] = useState<string | null>(null);
  const [searchMeta, setSearchMeta] = useState<{
    totalEmailsScanned: number;
    queryDetails: Array<{
      query: string;
      gmailQuery: string;
      resultCount: number;
    }>;
  } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Fetch accounts on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/gmail/accounts");
        const data = await res.json();
        if (data.success) {
          setAccounts(data.accounts);
          setSelectedAccountIds(
            data.accounts.map((a: Account) => a.accountId)
          );
        }
      } catch {
        // ignore
      }
    })();

    // Default date range: last 90 days
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    setDateTo(now.toISOString().split("T")[0]);
    setDateFrom(threeMonthsAgo.toISOString().split("T")[0]);
  }, []);

  const toggleAccount = useCallback((accountId: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
        : [...prev, accountId]
    );
  }, []);

  // Multi-query management
  const updateQuery = (index: number, value: string) => {
    setQueries((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addQuery = () => {
    setQueries((prev) => [...prev, ""]);
  };

  const removeQuery = (index: number) => {
    if (queries.length <= 1) return;
    setQueries((prev) => prev.filter((_, i) => i !== index));
  };

  const nonEmptyQueries = queries.filter((q) => q.trim());

  const handleSearch = async () => {
    if (nonEmptyQueries.length === 0) return;
    setPageState("searching");
    setError(null);
    setResults([]);
    setSelectedAttachments(new Set());
    setSearchMeta(null);

    try {
      const res = await fetch("/api/documents/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: nonEmptyQueries,
          accountIds:
            selectedAccountIds.length === accounts.length
              ? undefined
              : selectedAccountIds,
          dateFrom,
          dateTo,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setResults(data.results);
        setSearchMeta({
          totalEmailsScanned: data.totalEmailsScanned,
          queryDetails: data.queryDetails,
        });
        setPageState("results");
      } else {
        setError(data.error);
        setPageState("error");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Search failed");
      setPageState("error");
    }
  };

  // Unique key for an attachment
  const attKey = (r: SearchResult, a: AttachmentInfo) =>
    `${r.accountId}:${r.messageId}:${a.attachmentId}`;

  const toggleAttachment = (key: string) => {
    setSelectedAttachments((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    const all = new Set<string>();
    for (const r of results) {
      for (const a of r.attachments) {
        all.add(attKey(r, a));
      }
    }
    setSelectedAttachments(all);
  };

  const deselectAll = () => setSelectedAttachments(new Set());

  const handleDownloadSingle = async (
    accountId: string,
    messageId: string,
    attachmentId: string,
    filename: string
  ) => {
    const key = `${accountId}:${messageId}:${attachmentId}`;
    setDownloadingId(key);
    try {
      const params = new URLSearchParams({
        accountId,
        messageId,
        attachmentId,
      });
      const res = await fetch(`/api/documents/download?${params}`);

      if (!res.ok) {
        throw new Error("Download failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadZip = async () => {
    if (selectedAttachments.size === 0) return;
    setPageState("downloading");

    const items: Array<{
      accountId: string;
      messageId: string;
      attachmentId: string;
      filename: string;
    }> = [];

    for (const r of results) {
      for (const a of r.attachments) {
        if (selectedAttachments.has(attKey(r, a))) {
          items.push({
            accountId: r.accountId,
            messageId: r.messageId,
            attachmentId: a.attachmentId,
            filename: a.filename,
          });
        }
      }
    }

    try {
      const res = await fetch("/api/documents/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      if (!res.ok) {
        throw new Error("Download failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "documents.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setPageState("results");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Download failed");
      setPageState("error");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Document Finder</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Search your Gmail for invoices, statements, and other documents
              </p>
            </div>
            <Link href="/dashboard">
              <Button variant="outline">← Dashboard</Button>
            </Link>
          </div>
        </div>

        {/* Search Form */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Search Documents</CardTitle>
            <CardDescription>
              Add one or more document types to search for
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Multi-query inputs */}
            <div>
              <Label>What are you looking for?</Label>
              <div className="space-y-2 mt-1">
                {queries.map((q, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      placeholder={
                        idx === 0
                          ? "e.g., HDFC bank statements"
                          : idx === 1
                            ? "e.g., Facebook invoices"
                            : "e.g., electricity bills"
                      }
                      value={q}
                      onChange={(e) => updateQuery(idx, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (e.shiftKey || e.metaKey) {
                            addQuery();
                          } else {
                            handleSearch();
                          }
                        }
                      }}
                    />
                    {queries.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 px-2 text-gray-400 hover:text-red-500"
                        onClick={() => removeQuery(idx)}
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={addQuery}
              >
                + Add another document type
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="dateFrom">From</Label>
                <Input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="dateTo">To</Label>
                <Input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            {accounts.length > 1 && (
              <div>
                <Label>Accounts</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {accounts.map((acc) => (
                    <Badge
                      key={acc.accountId}
                      variant={
                        selectedAccountIds.includes(acc.accountId)
                          ? "default"
                          : "outline"
                      }
                      className="cursor-pointer"
                      onClick={() => toggleAccount(acc.accountId)}
                    >
                      {acc.email}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={handleSearch}
              disabled={
                nonEmptyQueries.length === 0 ||
                pageState === "searching" ||
                !dateFrom ||
                !dateTo
              }
              className="w-full"
            >
              {pageState === "searching"
                ? "Searching..."
                : `Search${nonEmptyQueries.length > 1 ? ` (${nonEmptyQueries.length} types)` : ""}`}
            </Button>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <Alert className="mb-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
            <AlertDescription className="text-red-800 dark:text-red-200">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Searching Spinner */}
        {pageState === "searching" && (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                Searching your emails with AI...
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {nonEmptyQueries.length > 1
                  ? `Searching for ${nonEmptyQueries.length} document types — this may take a moment`
                  : "This may take a moment"}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {(pageState === "results" || pageState === "downloading") && (
          <>
            {/* Search meta */}
            {searchMeta && (
              <div className="mb-4 text-sm text-gray-500 space-y-1">
                <p>
                  Scanned {searchMeta.totalEmailsScanned} emails &middot;{" "}
                  {results.length} relevant result
                  {results.length !== 1 ? "s" : ""} found
                </p>
                {searchMeta.queryDetails.map((qd, i) => (
                  <p key={i} className="text-xs">
                    <Badge variant="outline" className="mr-1 text-xs">
                      {qd.query}
                    </Badge>
                    {qd.resultCount} result{qd.resultCount !== 1 ? "s" : ""}{" "}
                    <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded ml-1">
                      {qd.gmailQuery}
                    </code>
                  </p>
                ))}
              </div>
            )}

            {results.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-gray-500">
                    No matching documents found. Try adjusting your search or
                    date range.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Bulk action bar */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={selectAll}>
                      Select All
                    </Button>
                    <Button variant="outline" size="sm" onClick={deselectAll}>
                      Deselect All
                    </Button>
                  </div>
                  <Button
                    onClick={handleDownloadZip}
                    disabled={
                      selectedAttachments.size === 0 ||
                      pageState === "downloading"
                    }
                  >
                    {pageState === "downloading"
                      ? "Building ZIP..."
                      : `Download ${selectedAttachments.size} file${selectedAttachments.size !== 1 ? "s" : ""} as ZIP`}
                  </Button>
                </div>

                {/* Result list */}
                <div className="space-y-3">
                  {results.map((result) => (
                    <Card key={`${result.accountId}-${result.messageId}`}>
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium truncate">
                                {result.subject}
                              </p>
                              {result.matchedQuery && (
                                <Badge variant="secondary" className="shrink-0 text-xs">
                                  {result.matchedQuery}
                                </Badge>
                              )}
                              <Badge
                                variant={
                                  result.confidence >= 0.8
                                    ? "default"
                                    : "outline"
                                }
                                className="shrink-0"
                              >
                                {Math.round(result.confidence * 100)}%
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-500 truncate">
                              From: {result.sender}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {result.date} &middot; {result.accountEmail}
                            </p>
                            {result.reasoning && (
                              <p className="text-xs text-gray-400 mt-1 italic">
                                {result.reasoning}
                              </p>
                            )}

                            {/* Password hint */}
                            {result.passwordHint && (
                              <div className="mt-2 flex items-start gap-2 p-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                                <span className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                                  🔒
                                </span>
                                <div>
                                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                                    Password Protected
                                  </p>
                                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                                    {result.passwordHint}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Attachments */}
                            <div className="mt-3 space-y-2">
                              {result.attachments.map((att) => {
                                const key = attKey(result, att);
                                const isSelected =
                                  selectedAttachments.has(key);
                                const isDownloading = downloadingId === key;
                                return (
                                  <div
                                    key={att.attachmentId}
                                    className={`flex items-center gap-3 p-2 rounded border cursor-pointer transition-colors ${
                                      isSelected
                                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700"
                                        : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                                    }`}
                                    onClick={() => toggleAttachment(key)}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleAttachment(key)}
                                      className="shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">
                                        {att.filename}
                                      </p>
                                      <p className="text-xs text-gray-400">
                                        {att.mimeType} &middot;{" "}
                                        {formatSize(att.size)}
                                      </p>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={isDownloading}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownloadSingle(
                                          result.accountId,
                                          result.messageId,
                                          att.attachmentId,
                                          att.filename
                                        );
                                      }}
                                    >
                                      {isDownloading ? "..." : "Download"}
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
