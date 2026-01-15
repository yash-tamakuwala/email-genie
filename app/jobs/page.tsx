"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface JobStatus {
  lastRunAt: string;
  status: "success" | "partial" | "error" | "running";
  processedCount: number;
  errorCount: number;
  message?: string;
  updatedAt: string;
}

export default function JobsPage() {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/jobs/status");
      const data = await response.json();
      if (data.success) {
        setStatus(data.status);
      } else {
        setError(data.error || "Failed to fetch status");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const runJobNow = async () => {
    try {
      setRunning(true);
      setError(null);
      const response = await fetch("/api/jobs/process-emails", { method: "POST" });
      const data = await response.json();
      if (!data.success) {
        setError(data.error || "Failed to run job");
      }
      await fetchStatus();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Background Jobs</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Monitor email processing and trigger runs manually
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

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Latest Job Status</CardTitle>
              <CardDescription>Last run details and status</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-gray-500">Loading status...</p>
              ) : status ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={status.status === "success" ? "default" : "outline"}>
                      {status.status.toUpperCase()}
                    </Badge>
                    <span className="text-sm text-gray-500">
                      {new Date(status.lastRunAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {status.message || "No message"}
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span>Processed: {status.processedCount}</span>
                    <span>Errors: {status.errorCount}</span>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">No job runs yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Manual Run</CardTitle>
              <CardDescription>Trigger a job run immediately</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={runJobNow} disabled={running}>
                {running ? "Running..." : "Run Job Now"}
              </Button>
              <p className="text-xs text-gray-500">
                The cron job runs automatically every 2 minutes on Vercel.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
