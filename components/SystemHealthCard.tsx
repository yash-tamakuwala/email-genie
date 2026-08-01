"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface HealthIssue {
  kind: string;
  severity: "ok" | "warning" | "error";
  title: string;
  detail: string;
  since?: string;
}

interface AccountHealth {
  accountId: string;
  email: string;
  connected: boolean;
  error?: string;
  errorAt?: string;
  lastEmailCheck?: string;
}

interface JobHealth {
  lastRunAt: string | null;
  status: string | null;
  ageMinutes: number | null;
  stale: boolean;
  processedCount: number;
  errorCount: number;
  aiFailureCount: number;
  message?: string;
}

interface HealthReport {
  overall: "ok" | "warning" | "error";
  checkedAt: string;
  issues: HealthIssue[];
  accounts: AccountHealth[];
  job: JobHealth;
}

const TONE = {
  ok: {
    card: "border-green-200 dark:border-green-800",
    badge: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
    label: "All systems normal",
  },
  warning: {
    card: "border-amber-300 dark:border-amber-800",
    badge: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
    label: "Needs attention",
  },
  error: {
    card: "border-red-300 dark:border-red-800",
    badge: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    label: "Action required",
  },
} as const;

export function SystemHealthCard() {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/health");
      const data = await res.json();
      if (data.success) {
        setHealth(data.health);
        setError(null);
      } else {
        setError(data.error || "Failed to load health");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  if (loading && !health) {
    return (
      <Card className="mb-6">
        <CardContent className="py-6 text-sm text-gray-500">Checking system health...</CardContent>
      </Card>
    );
  }

  if (error && !health) {
    return (
      <Card className="mb-6 border-red-300 dark:border-red-800">
        <CardContent className="py-6 text-sm text-red-700 dark:text-red-300">
          Could not load system health: {error}
        </CardContent>
      </Card>
    );
  }

  if (!health) return null;

  const tone = TONE[health.overall];

  return (
    <Card className={`mb-6 ${tone.card}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              System Health
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tone.badge}`}>
                {tone.label}
              </span>
            </CardTitle>
            <CardDescription>
              {health.job.lastRunAt
                ? `Last processing run ${health.job.ageMinutes} min ago — ${health.job.message ?? health.job.status}`
                : "Email processing has not run yet"}
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={fetchHealth} disabled={loading}>
            {loading ? "..." : "Refresh"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {health.issues.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            All accounts are syncing, the processing job is running on schedule, and AI
            categorization is working.
          </p>
        ) : (
          <div className="space-y-2">
            {health.issues.map((issue, i) => (
              <div
                key={i}
                className={`rounded-lg p-3 ${
                  issue.severity === "error"
                    ? "bg-red-50 dark:bg-red-900/20"
                    : "bg-amber-50 dark:bg-amber-900/20"
                }`}
              >
                <p className="font-medium text-sm">
                  {issue.severity === "error" ? "✕" : "!"} {issue.title}
                </p>
                <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">{issue.detail}</p>
                {issue.since && (
                  <p className="text-xs text-gray-500 mt-1">
                    Since {new Date(issue.since).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {health.accounts.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Account sync status</p>
            <div className="space-y-1.5">
              {health.accounts.map((account) => (
                <div
                  key={account.accountId}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="truncate">{account.email}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {account.lastEmailCheck && (
                      <span className="text-xs text-gray-500">
                        checked {new Date(account.lastEmailCheck).toLocaleTimeString()}
                      </span>
                    )}
                    <Badge variant={account.connected ? "outline" : "destructive"}>
                      {account.connected ? "connected" : "error"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
