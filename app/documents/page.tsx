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

interface FinancialAttachment {
  attachmentId: string;
  accountId: string;
  emailMessageId: string;
  emailSubject: string;
  emailFrom: string;
  emailDate: string;
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
  const [selectedDocType, setSelectedDocType] = useState<string>("all");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const fetchAttachments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (selectedDocType !== "all") {
        params.set("documentType", selectedDocType);
      }
      if (searchQuery.trim()) {
        params.set("search", searchQuery.trim());
      }

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
  }, [selectedDocType, searchQuery]);

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

  const getAccountEmail = (accountId: string) => {
    const account = accounts.find((acc) => acc.accountId === accountId);
    return account?.email || accountId;
  };

  const hasActiveFilters =
    searchQuery || selectedDocType !== "all" || datePreset !== "all";

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

        <Card>
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

              {/* Row 2: date preset shortcuts */}
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

              {/* Row 3: custom date range (only when custom is selected) */}
              {datePreset === "custom" && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">From</label>
                    <Input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">To</label>
                    <Input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  {(customFrom || customTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setCustomFrom(""); setCustomTo(""); }}
                      className="text-gray-500"
                    >
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
                    {hasActiveFilters
                      ? "No documents match your filters"
                      : "No financial documents saved yet"}
                  </p>
                  <p className="text-sm text-gray-400">
                    Financial documents (invoices, statements, receipts) are
                    automatically detected and saved when your emails are processed
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAttachments.map((attachment) => (
                    <div
                      key={attachment.attachmentId}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <p className="font-medium text-lg truncate">
                            {attachment.description || attachment.emailSubject}
                          </p>
                          <Badge
                            className={DOC_TYPE_COLORS[attachment.financialDocumentType] || ""}
                          >
                            {DOC_TYPE_LABELS[attachment.financialDocumentType] ||
                              attachment.financialDocumentType}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                          <span title={attachment.fileName}>{attachment.fileName}</span>
                          <span>{formatFileSize(attachment.fileSize)}</span>
                          <span>{getAccountEmail(attachment.accountId)}</span>
                          <span>{new Date(attachment.uploadedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-4 shrink-0"
                        disabled={downloading === attachment.attachmentId}
                        onClick={() => handleDownload(attachment.attachmentId)}
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
      </div>
    </div>
  );
}
