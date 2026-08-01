"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Rule {
  ruleId: string;
  name: string;
  enabled: boolean;
  priority: number;
}

interface PredictedActions {
  matched: boolean;
  markImportant: boolean;
  skipInbox: boolean;
  markReadAndLabel: boolean;
  blockAndUnsubscribe: boolean;
  labels: string[];
  reasoning: string;
  confidence: number;
}

interface TestResult {
  emailId: string;
  messageId: string;
  sender: string;
  subject: string;
  processedAt: string;
  actualActions: string[];
  predicted: PredictedActions | null;
  error?: string;
}

interface TestResponse {
  rule: { ruleId: string; name: string; enabled: boolean };
  tested: number;
  totalAvailable: number;
  truncated: boolean;
  matchedCount: number;
  failedCount: number;
  results: TestResult[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  days: string;
  accountLabel: string;
}

function predictedLabels(p: PredictedActions): string[] {
  const out: string[] = [];
  if (p.markImportant) out.push("mark important");
  if (p.skipInbox) out.push("archive");
  if (p.markReadAndLabel) out.push("mark read");
  if (p.blockAndUnsubscribe) out.push("block + unsubscribe");
  p.labels.forEach((l) => out.push(`label: ${l}`));
  return out;
}

export function RuleTestDialog({ open, onOpenChange, accountId, days, accountLabel }: Props) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<TestResponse | null>(null);

  useEffect(() => {
    if (!open) return;

    setError(null);
    fetch("/api/rules")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setRules(data.rules || []);
        else setError(data.error || "Failed to load rules");
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load rules")
      );
  }, [open]);

  const runTest = async () => {
    if (!selectedRuleId) return;

    setRunning(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch("/api/rules/test-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId: selectedRuleId, accountId, days }),
      });
      const data = await res.json();

      if (data.success) setResponse(data as TestResponse);
      else setError(data.error || "Test run failed");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Test run failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Test a rule against past emails</DialogTitle>
          <DialogDescription>
            Runs the selected rule on your most recent processed emails and shows what it
            would do. Nothing in Gmail is changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1.5 block">Rule</label>
              <Select value={selectedRuleId} onValueChange={setSelectedRuleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a rule to test" />
                </SelectTrigger>
                <SelectContent>
                  {rules.map((rule) => (
                    <SelectItem key={rule.ruleId} value={rule.ruleId}>
                      {rule.name}
                      {!rule.enabled ? " (disabled)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={runTest} disabled={!selectedRuleId || running}>
              {running ? "Running..." : "Run test"}
            </Button>
          </div>

          <p className="text-xs text-gray-500">
            Testing against up to 25 of the most recent emails from {accountLabel} in the
            last {days} days. Disabled rules are evaluated as if enabled.
          </p>

          {error && (
            <Alert className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
              <AlertDescription className="text-red-800 dark:text-red-200">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {running && (
            <p className="text-sm text-gray-500 py-4 text-center">
              Categorizing emails — this can take up to a minute.
            </p>
          )}

          {response && (
            <div className="space-y-3">
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-sm">
                <span className="font-medium">{response.rule.name}</span> matched{" "}
                <span className="font-medium">{response.matchedCount}</span> of{" "}
                {response.tested} email{response.tested === 1 ? "" : "s"}.
                {response.failedCount > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    {" "}
                    {response.failedCount} could not be evaluated.
                  </span>
                )}
                {response.truncated && (
                  <span className="text-gray-500">
                    {" "}
                    Showing the newest 25 of {response.totalAvailable} available.
                  </span>
                )}
              </div>

              {response.results.length === 0 && (
                <p className="text-sm text-gray-500 py-4 text-center">
                  No processed emails found for these filters.
                </p>
              )}

              {response.results.map((result) => {
                const matched = result.predicted?.matched ?? false;
                return (
                  <div
                    key={result.emailId}
                    className={`rounded-lg border p-3 ${
                      matched
                        ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                        : "border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <div className="flex justify-between gap-3 items-start mb-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{result.subject}</p>
                        <p className="text-xs text-gray-500 truncate">{result.sender}</p>
                      </div>
                      <Badge variant={matched ? "default" : "outline"}>
                        {matched ? "would match" : "no match"}
                      </Badge>
                    </div>

                    {result.error ? (
                      <p className="text-xs text-red-600 dark:text-red-400">{result.error}</p>
                    ) : (
                      <div className="grid sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-gray-500 mb-1">This rule would</p>
                          {result.predicted && predictedLabels(result.predicted).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {predictedLabels(result.predicted).map((a, i) => (
                                <Badge key={i} variant="secondary">
                                  {a}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400">nothing</span>
                          )}
                        </div>
                        <div>
                          <p className="text-gray-500 mb-1">Actually happened</p>
                          {result.actualActions.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {result.actualActions.map((a, i) => (
                                <Badge key={i} variant="outline">
                                  {a}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400">nothing</span>
                          )}
                        </div>
                      </div>
                    )}

                    {result.predicted?.reasoning && (
                      <p className="text-xs text-gray-500 italic mt-2">
                        {result.predicted.reasoning}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
