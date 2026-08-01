import { NextRequest, NextResponse } from "next/server";
import {
  getCategorizationRule,
  getRecentEmailLogs,
  listGmailAccounts,
  EmailLog,
} from "@/lib/dynamodb";
import { categorizeEmail } from "@/lib/ai";
import { SINGLE_USER_ID } from "@/lib/auth";

// Each email costs one model call, so cap the batch and run a few at a time to
// stay inside the function's wall clock.
const MAX_EMAILS = 25;
const CONCURRENCY = 5;

export const maxDuration = 60;

interface TestResult {
  emailId: string;
  messageId: string;
  sender: string;
  subject: string;
  processedAt: string;
  actualActions: string[];
  predicted: {
    matched: boolean;
    markImportant: boolean;
    skipInbox: boolean;
    markReadAndLabel: boolean;
    blockAndUnsubscribe: boolean;
    labels: string[];
    reasoning: string;
    confidence: number;
  } | null;
  error?: string;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );

  return results;
}

// POST - Dry run a single rule against already-processed emails. Never touches Gmail.
export async function POST(request: NextRequest) {
  try {
    const { ruleId, accountId, days } = await request.json();

    if (!ruleId) {
      return NextResponse.json(
        { success: false, error: "ruleId is required" },
        { status: 400 }
      );
    }

    const rule = await getCategorizationRule(SINGLE_USER_ID, ruleId);
    if (!rule) {
      return NextResponse.json(
        { success: false, error: "Rule not found" },
        { status: 404 }
      );
    }

    const lookbackDays = Math.min(Math.max(parseInt(String(days ?? 7), 10) || 7, 1), 30);

    let logs: EmailLog[] = [];
    if (accountId && accountId !== "all") {
      logs = await getRecentEmailLogs(accountId, lookbackDays);
    } else {
      const accounts = await listGmailAccounts(SINGLE_USER_ID);
      for (const account of accounts) {
        logs.push(...(await getRecentEmailLogs(account.accountId, lookbackDays)));
      }
    }

    logs.sort(
      (a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime()
    );

    const totalAvailable = logs.length;
    const batch = logs.slice(0, MAX_EMAILS);

    // Evaluate this rule alone, and force it enabled so a freshly created or
    // paused rule can still be tested before being switched on.
    const soloRule = { ...rule, enabled: true };

    const results = await mapWithConcurrency<EmailLog, TestResult>(
      batch,
      CONCURRENCY,
      async (log) => {
        const base = {
          emailId: log.emailId,
          messageId: log.messageId,
          sender: log.sender,
          subject: log.subject,
          processedAt: log.processedAt,
          actualActions: log.appliedActions ?? [],
        };

        try {
          const outcome = await categorizeEmail(
            {
              from: log.sender,
              subject: log.subject,
              body: log.body || log.snippet || "",
              snippet: log.snippet || log.body || "",
            },
            [soloRule]
          );

          if (outcome.aiFailed) {
            return {
              ...base,
              predicted: null,
              error: `AI unavailable: ${outcome.aiError ?? "unknown error"}`,
            };
          }

          return {
            ...base,
            predicted: {
              matched: outcome.matchedRuleName === rule.name,
              markImportant: outcome.shouldMarkImportant,
              skipInbox: outcome.shouldSkipInbox,
              markReadAndLabel: outcome.shouldMarkReadAndLabel,
              blockAndUnsubscribe: outcome.shouldBlockAndUnsubscribe,
              labels: outcome.suggestedLabels,
              reasoning: outcome.reasoning,
              confidence: outcome.confidence,
            },
          };
        } catch (error: unknown) {
          return {
            ...base,
            predicted: null,
            error: error instanceof Error ? error.message : "Categorization failed",
          };
        }
      }
    );

    const matchedCount = results.filter((r) => r.predicted?.matched).length;
    const failedCount = results.filter((r) => r.error).length;

    return NextResponse.json({
      success: true,
      rule: { ruleId: rule.ruleId, name: rule.name, enabled: rule.enabled },
      tested: results.length,
      totalAvailable,
      truncated: totalAvailable > batch.length,
      matchedCount,
      failedCount,
      results,
    });
  } catch (error: unknown) {
    console.error("Error running rule test:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
