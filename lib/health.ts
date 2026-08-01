import { getJobStatus, listGmailAccounts, GmailAccount, JobStatus } from "@/lib/dynamodb";
import { SINGLE_USER_ID } from "@/lib/auth";

// vercel.json runs the job every 2 minutes. Allow a wide margin so a single slow
// or skipped run does not raise a false alarm, while a genuinely stopped cron
// still surfaces quickly.
const STALE_JOB_THRESHOLD_MS = 15 * 60 * 1000;

export type HealthSeverity = "ok" | "warning" | "error";

export interface HealthIssue {
  kind: "account_disconnected" | "ai_failing" | "job_stale" | "job_never_run";
  severity: HealthSeverity;
  title: string;
  detail: string;
  since?: string;
}

export interface AccountHealth {
  accountId: string;
  email: string;
  connected: boolean;
  error?: string;
  errorAt?: string;
  lastEmailCheck?: string;
}

export interface JobHealth {
  lastRunAt: string | null;
  status: JobStatus["status"] | null;
  ageMinutes: number | null;
  stale: boolean;
  processedCount: number;
  errorCount: number;
  aiFailureCount: number;
  message?: string;
}

export interface HealthReport {
  overall: HealthSeverity;
  checkedAt: string;
  issues: HealthIssue[];
  accounts: AccountHealth[];
  job: JobHealth;
}

function toAccountHealth(account: GmailAccount): AccountHealth {
  return {
    accountId: account.accountId,
    email: account.email,
    connected: !account.syncError,
    error: account.syncError,
    errorAt: account.syncErrorAt,
    lastEmailCheck: account.lastEmailCheck
      ? new Date(account.lastEmailCheck).toISOString()
      : undefined,
  };
}

export async function getHealthReport(now: number = Date.now()): Promise<HealthReport> {
  const [accounts, jobStatus] = await Promise.all([
    listGmailAccounts(SINGLE_USER_ID),
    getJobStatus(),
  ]);

  return evaluateHealth(accounts, jobStatus, now);
}

// Pure evaluation, split from the fetch above so the failure paths can be
// exercised without standing up DynamoDB state.
export function evaluateHealth(
  accounts: GmailAccount[],
  jobStatus: JobStatus | null,
  now: number = Date.now()
): HealthReport {
  const issues: HealthIssue[] = [];

  for (const account of accounts) {
    if (account.syncError) {
      issues.push({
        kind: "account_disconnected",
        severity: "error",
        title: `${account.email} is not syncing`,
        detail: account.syncError,
        since: account.syncErrorAt,
      });
    }
  }

  const lastRunMs = jobStatus?.lastRunAt ? new Date(jobStatus.lastRunAt).getTime() : null;
  const ageMinutes =
    lastRunMs !== null && Number.isFinite(lastRunMs)
      ? Math.max(0, Math.round((now - lastRunMs) / 60000))
      : null;
  const stale = lastRunMs !== null && now - lastRunMs > STALE_JOB_THRESHOLD_MS;

  if (!jobStatus || lastRunMs === null) {
    issues.push({
      kind: "job_never_run",
      severity: "warning",
      title: "Email processing has never run",
      detail:
        "No job status recorded yet. If this persists, the cron is not reaching /api/jobs/process-emails.",
    });
  } else if (stale) {
    issues.push({
      kind: "job_stale",
      severity: "error",
      title: "Email processing has stalled",
      detail: `Last run was ${ageMinutes} minutes ago; it is scheduled every 2 minutes. The cron may have stopped or the job may be failing before it can report.`,
      since: jobStatus.lastRunAt,
    });
  }

  const aiFailureCount = jobStatus?.aiFailureCount ?? 0;
  if (aiFailureCount > 0) {
    issues.push({
      kind: "ai_failing",
      severity: "error",
      title: "AI categorization is failing",
      detail: `${aiFailureCount} email${aiFailureCount === 1 ? "" : "s"} in the last run fell back to basic rule matching because the AI call failed. Rules that rely on AI are not being applied. Check that AI_GATEWAY_API_KEY is valid.`,
      since: jobStatus?.lastRunAt,
    });
  }

  const overall: HealthSeverity = issues.some((i) => i.severity === "error")
    ? "error"
    : issues.some((i) => i.severity === "warning")
      ? "warning"
      : "ok";

  return {
    overall,
    checkedAt: new Date(now).toISOString(),
    issues,
    accounts: accounts.map(toAccountHealth),
    job: {
      lastRunAt: jobStatus?.lastRunAt ?? null,
      status: jobStatus?.status ?? null,
      ageMinutes,
      stale,
      processedCount: jobStatus?.processedCount ?? 0,
      errorCount: jobStatus?.errorCount ?? 0,
      aiFailureCount,
      message: jobStatus?.message,
    },
  };
}
