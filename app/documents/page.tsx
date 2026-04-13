"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FinancialAttachment {
  attachmentId: string;
  accountId: string;
  emailMessageId: string;
  emailSubject: string;
  emailFrom: string;
  emailTo: string;
  emailDate: string;
  emailBody: string;
  emailSnippet: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  financialDocumentType: string;
  description: string;
  uploadedAt: string;
}

interface Account {
  accountId: string;
  email: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  receipt: "Receipt",
  bank_statement: "Bank Statement",
  credit_card_statement: "Credit Card Statement",
  tax_document: "Tax Document",
  payment_confirmation: "Payment Confirmation",
};

const DOC_TYPE_COLORS: Record<string, string> = {
  invoice: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  receipt: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  bank_statement: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  credit_card_statement: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  tax_document: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  payment_confirmation: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
};

type DatePreset = "1day" | "1week" | "1month" | "custom" | "all";

const DATE_PRESETS: { label: string; value: DatePreset }[] = [
  { label: "All time", value: "all" },
  { label: "Today", value: "1day" },
  { label: "1 week", value: "1week" },
  { label: "1 month", value: "1month" },
  { label: "Custom", value: "custom" },
];

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getPresetRange(preset: DatePreset): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (preset === "1day") {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { from, to: now };
  }
  if (preset === "1week") {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from, to: now };
  }
  if (preset === "1month") {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 1);
    return { from, to: now };
  }
  return { from: null, to: null };
}

export default function DocumentsPage() {
  const [attachments, setAttachments] = useState<FinancialAttachment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [senderFilter, setSenderFilter] = useState("");
  const [receiverFilter, setReceiverFilter] = useState("");
  const [selectedDocType, setSelectedDocType] = useState<string>("all");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Detail dialog state
  const [selectedAttachment, setSelectedAttachment] = useState<FinancialAttachment | null>(null);

  // Historical processing state
  const [showHistorical, setShowHistorical] = useState(false);
  const [historicalMode, setHistoricalMode] = useState<"form" | "ai">("form");
  const [historicalAccountId, setHistoricalAccountId] = useState("");
  const [historicalMaxResults, setHistoricalMaxResults] = useState("50");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    messageId: string;
    from: string;
    to: string;
    subject: string;
    date: string;
    snippet: string;
  }[]>([]);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [saveDocType, setSaveDocType] = useState("invoice");
  const [lastQueryUsed, setLastQueryUsed] = useState("");
  const [saveResult, setSaveResult] = useState<{
    processed: number;
    skipped: number;
    errors: number;
    results: string[];
  } | null>(null);

  // Form builder fields
  const [formFrom, setFormFrom] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formHasAttachment, setFormHasAttachment] = useState(true);
  const [formAfter, setFormAfter] = useState("");
  const [formBefore, setFormBefore] = useState("");
  const [formOlderThan, setFormOlderThan] = useState("");
  const [formOlderThanUnit, setFormOlderThanUnit] = useState("d");
  const [formFilename, setFormFilename] = useState("");

  // AI mode state
  const [aiQuery, setAiQuery] = useState("");
  const [aiConverting, setAiConverting] = useState(false);
  const [aiConvertedQuery, setAiConvertedQuery] = useState("");
  const [aiExplanation, setAiExplanation] = useState("");

  const fetchAttachments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (selectedDocType !== "all") params.set("documentType", selectedDocType);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (senderFilter.trim()) params.set("sender", senderFilter.trim());
      if (receiverFilter.trim()) params.set("receiver", receiverFilter.trim());

      const url = `/api/financial-attachments${params.toString() ? `?${params}` : ""}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setAttachments(data.attachments);
      } else {
        setError(data.error);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [selectedDocType, searchQuery, senderFilter, receiverFilter]);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const response = await fetch("/api/gmail/accounts");
        const data = await response.json();
        if (data.success) setAccounts(data.accounts);
      } catch (err) {
        console.error("Error fetching accounts:", err);
      }
    };
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  // Client-side date filtering
  const filteredAttachments = useMemo(() => {
    if (datePreset === "all") return attachments;

    let from: Date | null = null;
    let to: Date | null = null;

    if (datePreset === "custom") {
      from = customFrom ? new Date(customFrom) : null;
      to = customTo ? new Date(customTo + "T23:59:59") : null;
    } else {
      ({ from, to } = getPresetRange(datePreset));
    }

    return attachments.filter((a) => {
      const uploaded = new Date(a.uploadedAt);
      if (from && uploaded < from) return false;
      if (to && uploaded > to) return false;
      return true;
    });
  }, [attachments, datePreset, customFrom, customTo]);

  const handleDownload = async (attachmentId: string) => {
    try {
      setDownloading(attachmentId);
      const response = await fetch(
        `/api/financial-attachments/download?attachmentId=${attachmentId}`
      );
      const data = await response.json();
      if (data.success) {
        window.open(data.downloadUrl, "_blank");
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert(`Error: ${message}`);
    } finally {
      setDownloading(null);
    }
  };

  function buildFormQuery(): string {
    const parts: string[] = [];
    if (formHasAttachment) parts.push("has:attachment");
    if (formFrom.trim()) parts.push(`from:${formFrom.trim()}`);
    if (formSubject.trim()) parts.push(`subject:${formSubject.trim()}`);
    if (formAfter) parts.push(`after:${formAfter.replace(/-/g, "/")}`);
    if (formBefore) parts.push(`before:${formBefore.replace(/-/g, "/")}`);
    if (formOlderThan.trim()) parts.push(`older_than:${formOlderThan.trim()}${formOlderThanUnit}`);
    if (formFilename.trim()) parts.push(`filename:${formFilename.trim()}`);
    return parts.join(" ");
  }

  const handleSearch = async (query: string) => {
    if (!historicalAccountId || !query) return;

    try {
      setSearching(true);
      setSearchResults([]);
      setSelectedMessageIds(new Set());
      setSaveResult(null);
      setLastQueryUsed(query);

      const params = new URLSearchParams({
        accountId: historicalAccountId,
        query,
        maxResults: historicalMaxResults,
      });

      const response = await fetch(`/api/financial-attachments/process-historical?${params}`);
      const data = await response.json();

      if (data.success) {
        setSearchResults(data.emails || []);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: unknown) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSearching(false);
    }
  };

  const handleSaveSelected = async () => {
    if (selectedMessageIds.size === 0 || !historicalAccountId) return;

    try {
      setSaving(true);
      setSaveResult(null);

      const response = await fetch("/api/financial-attachments/process-historical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: historicalAccountId,
          messageIds: [...selectedMessageIds],
          documentType: saveDocType,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setSaveResult({
          processed: data.processed,
          skipped: data.skipped,
          errors: data.errors,
          results: data.results || [],
        });
        await fetchAttachments();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: unknown) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleFormSearch = () => {
    const query = buildFormQuery();
    if (!query) return;
    handleSearch(query);
  };

  const handleAiSearch = async () => {
    if (!aiQuery.trim() || !historicalAccountId) return;

    try {
      setAiConverting(true);
      setAiConvertedQuery("");
      setAiExplanation("");

      const response = await fetch("/api/financial-attachments/convert-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naturalLanguageQuery: aiQuery.trim() }),
      });

      const data = await response.json();
      if (data.success) {
        setAiConvertedQuery(data.query);
        setAiExplanation(data.explanation);
        setAiConverting(false);
        await handleSearch(data.query);
      } else {
        alert(`Error: ${data.error}`);
        setAiConverting(false);
      }
    } catch (err: unknown) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
      setAiConverting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedMessageIds.size === searchResults.length) {
      setSelectedMessageIds(new Set());
    } else {
      setSelectedMessageIds(new Set(searchResults.map((e) => e.messageId)));
    }
  };

  const toggleSelect = (messageId: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const getAccountEmail = (accountId: string) => {
    const account = accounts.find((acc) => acc.accountId === accountId);
    return account?.email || accountId;
  };

  const hasActiveFilters =
    searchQuery || selectedDocType !== "all" || datePreset !== "all" || senderFilter || receiverFilter;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Financial Documents</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Invoices, statements, and receipts saved from your emails
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

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Saved Documents ({filteredAttachments.length})</CardTitle>
            <CardDescription>
              Financial documents are automatically detected and saved from your emails
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Row 1: search + doc type + refresh */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    placeholder="Search by description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="w-56">
                  <Select value={selectedDocType} onValueChange={setSelectedDocType}>
                    <SelectTrigger>
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" onClick={fetchAttachments}>
                  Refresh
                </Button>
              </div>

              {/* Row 2: sender/receiver filters */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    placeholder="Filter by sender..."
                    value={senderFilter}
                    onChange={(e) => setSenderFilter(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    placeholder="Filter by receiver..."
                    value={receiverFilter}
                    onChange={(e) => setReceiverFilter(e.target.value)}
                  />
                </div>
              </div>

              {/* Row 3: date preset shortcuts */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-500 dark:text-gray-400 mr-1">Date:</span>
                {DATE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setDatePreset(preset.value)}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                      datePreset === preset.value
                        ? "bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white"
                        : "bg-white text-gray-700 border-gray-300 hover:border-gray-400 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:border-gray-400"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Custom date range */}
              {datePreset === "custom" && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">From</label>
                    <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">To</label>
                    <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-40" />
                  </div>
                  {(customFrom || customTo) && (
                    <Button variant="ghost" size="sm" onClick={() => { setCustomFrom(""); setCustomTo(""); }} className="text-gray-500">
                      Clear
                    </Button>
                  )}
                </div>
              )}

              {/* Attachments list */}
              {loading ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Loading documents...</p>
                </div>
              ) : filteredAttachments.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-2">
                    {hasActiveFilters ? "No documents match your filters" : "No financial documents saved yet"}
                  </p>
                  <p className="text-sm text-gray-400">
                    Financial documents (invoices, statements, receipts) are automatically detected and saved when your emails are processed
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAttachments.map((attachment) => (
                    <div
                      key={attachment.attachmentId}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
                      onClick={() => setSelectedAttachment(attachment)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <p className="font-medium text-lg truncate">
                            {attachment.description || attachment.emailSubject}
                          </p>
                          <Badge className={DOC_TYPE_COLORS[attachment.financialDocumentType] || ""}>
                            {DOC_TYPE_LABELS[attachment.financialDocumentType] || attachment.financialDocumentType}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                          <span title={attachment.fileName}>{attachment.fileName}</span>
                          <span>{formatFileSize(attachment.fileSize)}</span>
                          <span>From: {attachment.emailFrom}</span>
                          {attachment.emailTo && <span>To: {attachment.emailTo}</span>}
                          <span>{new Date(attachment.uploadedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-4 shrink-0"
                        disabled={downloading === attachment.attachmentId}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(attachment.attachmentId);
                        }}
                      >
                        {downloading === attachment.attachmentId ? "..." : "Download"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Process Older Emails Section */}
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setShowHistorical(!showHistorical)}
          >
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Process Older Emails</CardTitle>
                <CardDescription>
                  Search your Gmail for older financial documents and save them
                </CardDescription>
              </div>
              <span className="text-xl text-gray-400">{showHistorical ? "−" : "+"}</span>
            </div>
          </CardHeader>
          {showHistorical && (
            <CardContent>
              <div className="space-y-5">
                {/* Account + Max Results (shared across modes) */}
                <div className="flex gap-3">
                  <div className="w-56">
                    <Select value={historicalAccountId} onValueChange={setHistoricalAccountId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.accountId} value={account.accountId}>
                            {account.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      placeholder="Max"
                      value={historicalMaxResults}
                      onChange={(e) => setHistoricalMaxResults(e.target.value)}
                      min={1}
                      max={100}
                    />
                  </div>
                </div>

                {/* Mode toggle */}
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
                  <button
                    onClick={() => setHistoricalMode("form")}
                    className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                      historicalMode === "form"
                        ? "bg-white dark:bg-gray-700 shadow-sm"
                        : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    Form Builder
                  </button>
                  <button
                    onClick={() => setHistoricalMode("ai")}
                    className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                      historicalMode === "ai"
                        ? "bg-white dark:bg-gray-700 shadow-sm"
                        : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    AI Search
                  </button>
                </div>

                {/* Form Builder Mode */}
                {historicalMode === "form" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm text-gray-600 dark:text-gray-400 mb-1 block">From (sender)</label>
                        <Input placeholder="e.g. hdfc, amazon, noreply@bank.com" value={formFrom} onChange={(e) => setFormFrom(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-sm text-gray-600 dark:text-gray-400 mb-1 block">Subject contains</label>
                        <Input placeholder="e.g. invoice, statement, receipt" value={formSubject} onChange={(e) => setFormSubject(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm text-gray-600 dark:text-gray-400 mb-1 block">After date</label>
                        <Input type="date" value={formAfter} onChange={(e) => setFormAfter(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-sm text-gray-600 dark:text-gray-400 mb-1 block">Before date</label>
                        <Input type="date" value={formBefore} onChange={(e) => setFormBefore(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-sm text-gray-600 dark:text-gray-400 mb-1 block">Older than</label>
                        <div className="flex gap-2">
                          <Input type="number" placeholder="e.g. 30" value={formOlderThan} onChange={(e) => setFormOlderThan(e.target.value)} min={1} className="w-20" />
                          <Select value={formOlderThanUnit} onValueChange={setFormOlderThanUnit}>
                            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="d">Days</SelectItem>
                              <SelectItem value="m">Months</SelectItem>
                              <SelectItem value="y">Years</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-gray-600 dark:text-gray-400 mb-1 block">Attachment filename</label>
                        <Input placeholder="e.g. pdf, invoice.pdf" value={formFilename} onChange={(e) => setFormFilename(e.target.value)} />
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={formHasAttachment} onChange={(e) => setFormHasAttachment(e.target.checked)} className="rounded" />
                          <span className="text-sm text-gray-600 dark:text-gray-400">Has attachment</span>
                        </label>
                      </div>
                    </div>
                    {buildFormQuery() && (
                      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Query: </span>
                        <code className="text-gray-900 dark:text-gray-100">{buildFormQuery()}</code>
                      </div>
                    )}
                    <Button onClick={handleFormSearch} disabled={searching || !historicalAccountId || !buildFormQuery()} className="w-full">
                      {searching ? "Searching..." : "Search"}
                    </Button>
                  </div>
                )}

                {/* AI Search Mode */}
                {historicalMode === "ai" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400 mb-1 block">Describe what you&apos;re looking for in plain English</label>
                      <Input placeholder="e.g. Find all invoices from HDFC bank in the last 6 months" value={aiQuery} onChange={(e) => setAiQuery(e.target.value)} />
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      <p className="font-medium mb-1">Examples:</p>
                      <ul className="list-disc ml-5 space-y-1">
                        <li>All invoices from last year</li>
                        <li>Credit card statements from HDFC in the last 3 months</li>
                        <li>Bank statements with PDF attachments from 2025</li>
                        <li>Receipts from Amazon or Flipkart</li>
                      </ul>
                    </div>
                    {aiConvertedQuery && (
                      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 space-y-2">
                        <div className="text-sm">
                          <span className="text-gray-500 dark:text-gray-400">Gmail query: </span>
                          <code className="text-gray-900 dark:text-gray-100">{aiConvertedQuery}</code>
                        </div>
                        {aiExplanation && <p className="text-xs text-gray-500 dark:text-gray-400">{aiExplanation}</p>}
                      </div>
                    )}
                    <Button onClick={handleAiSearch} disabled={aiConverting || searching || !historicalAccountId || !aiQuery.trim()} className="w-full">
                      {aiConverting ? "Converting..." : searching ? "Searching..." : "Search"}
                    </Button>
                  </div>
                )}

                {/* Query used */}
                {lastQueryUsed && searchResults.length > 0 && (
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Query used: </span>
                    <code className="text-gray-900 dark:text-gray-100">{lastQueryUsed}</code>
                  </div>
                )}

                {/* Search Results — email list with checkboxes */}
                {searchResults.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Found {searchResults.length} emails — select which to save
                      </p>
                      <button onClick={toggleSelectAll} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                        {selectedMessageIds.size === searchResults.length ? "Deselect all" : "Select all"}
                      </button>
                    </div>

                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {searchResults.map((email) => (
                        <label
                          key={email.messageId}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedMessageIds.has(email.messageId)
                              ? "bg-blue-50 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700"
                              : "bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedMessageIds.has(email.messageId)}
                            onChange={() => toggleSelect(email.messageId)}
                            className="mt-1 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{email.subject || "(no subject)"}</p>
                            <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                              <span>From: {email.from}</span>
                              {email.to && <span>To: {email.to}</span>}
                              {email.date && <span>{email.date}</span>}
                            </div>
                            {email.snippet && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 line-clamp-1">{email.snippet}</p>}
                          </div>
                        </label>
                      ))}
                    </div>

                    {/* Save controls */}
                    {selectedMessageIds.size > 0 && (
                      <div className="flex items-center gap-3 pt-2 border-t">
                        <div className="w-56">
                          <Select value={saveDocType} onValueChange={setSaveDocType}>
                            <SelectTrigger>
                              <SelectValue placeholder="Document type" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button onClick={handleSaveSelected} disabled={saving} className="flex-1">
                          {saving ? "Saving..." : `Save ${selectedMessageIds.size} selected`}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Save results */}
                {saveResult && (
                  <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                    <AlertDescription>
                      <div className="text-blue-800 dark:text-blue-200">
                        <p className="font-medium mb-1">
                          Saved {saveResult.processed}, Skipped {saveResult.skipped}, Errors {saveResult.errors}
                        </p>
                        {saveResult.results.length > 0 && (
                          <ul className="list-disc ml-5 mt-2 text-sm">
                            {saveResult.results.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Email Detail Dialog */}
        <Dialog
          open={!!selectedAttachment}
          onOpenChange={(open) => { if (!open) setSelectedAttachment(null); }}
        >
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            {selectedAttachment && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3 flex-wrap">
                    <span>{selectedAttachment.description || selectedAttachment.emailSubject}</span>
                    <Badge className={DOC_TYPE_COLORS[selectedAttachment.financialDocumentType] || ""}>
                      {DOC_TYPE_LABELS[selectedAttachment.financialDocumentType] || selectedAttachment.financialDocumentType}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription>
                    {selectedAttachment.fileName} ({formatFileSize(selectedAttachment.fileSize)})
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                  {/* Email metadata */}
                  <div className="space-y-2 text-sm">
                    <div className="flex gap-2">
                      <span className="text-gray-500 dark:text-gray-400 w-20 shrink-0">From:</span>
                      <span className="font-medium">{selectedAttachment.emailFrom}</span>
                    </div>
                    {selectedAttachment.emailTo && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 dark:text-gray-400 w-20 shrink-0">To:</span>
                        <span className="font-medium">{selectedAttachment.emailTo}</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <span className="text-gray-500 dark:text-gray-400 w-20 shrink-0">Subject:</span>
                      <span className="font-medium">{selectedAttachment.emailSubject}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-gray-500 dark:text-gray-400 w-20 shrink-0">Date:</span>
                      <span>{selectedAttachment.emailDate ? new Date(selectedAttachment.emailDate).toLocaleString() : "N/A"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-gray-500 dark:text-gray-400 w-20 shrink-0">Account:</span>
                      <span>{getAccountEmail(selectedAttachment.accountId)}</span>
                    </div>
                  </div>

                  {/* Email body */}
                  {selectedAttachment.emailBody && (
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Email Content</p>
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 max-h-80 overflow-y-auto text-sm whitespace-pre-wrap border">
                        {selectedAttachment.emailBody}
                      </div>
                    </div>
                  )}

                  {/* Download button */}
                  <Button
                    className="w-full"
                    disabled={downloading === selectedAttachment.attachmentId}
                    onClick={() => handleDownload(selectedAttachment.attachmentId)}
                  >
                    {downloading === selectedAttachment.attachmentId
                      ? "Generating link..."
                      : `Download ${selectedAttachment.fileName}`}
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
