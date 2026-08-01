import {
  findMatchingRule,
  applyRuleConstraints,
  findRuleByName,
  pickHigherPriority,
  type CategorizationResult,
} from "@/lib/ai";
import { evaluateHealth } from "@/lib/health";
import type { CategorizationRule, GmailAccount, JobStatus } from "@/lib/dynamodb";

let pass = 0;
let fail = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}\n         expected ${e}\n         actual   ${a}`);
  }
}

function rule(p: Partial<CategorizationRule>): CategorizationRule {
  return {
    pk: "USER#u", sk: "RULE#x", userId: "u", ruleId: "x", name: "r",
    type: "hybrid", priority: 100, enabled: true, accountIds: [],
    conditions: {}, actions: {}, createdAt: "", updatedAt: "",
    ...p,
  } as CategorizationRule;
}

function email(p: Partial<{ from: string; subject: string; body: string }> = {}) {
  return { from: "a@b.com", subject: "s", body: "b", snippet: "", ...p };
}

function aiResult(p: Partial<CategorizationResult> = {}): CategorizationResult {
  return {
    shouldMarkImportant: false, shouldPinConversation: false, shouldSkipInbox: false,
    shouldMarkReadAndLabel: false, shouldBlockAndUnsubscribe: false,
    suggestedLabels: [], matchedRuleName: "", isFinancialDocument: false,
    financialDocumentType: "none", financialDocumentDescription: "",
    reasoning: "because", confidence: 0.9,
    ...p,
  };
}

console.log("\n[1] findMatchingRule — conditions AND across groups, OR within");
{
  const upwork = rule({
    name: "Upwork",
    conditions: { senderEmail: ["donotreply@upwork.com"], subjectContains: ["new job alert"] },
  });
  check("both match -> matches",
    findMatchingRule(email({ from: "<donotreply@upwork.com>", subject: "New job alert: React" }), [upwork])?.name, "Upwork");
  check("sender only -> no match (was the OR bug)",
    findMatchingRule(email({ from: "<donotreply@upwork.com>", subject: "Client sent a message" }), [upwork]), null);
  check("subject only -> no match (was the OR bug)",
    findMatchingRule(email({ from: "<someone@else.com>", subject: "New job alert" }), [upwork]), null);
}
{
  const r = rule({ name: "Multi", conditions: { subjectContains: ["alpha", "beta"] } });
  check("OR within one group (alpha)", findMatchingRule(email({ subject: "has alpha" }), [r])?.name, "Multi");
  check("OR within one group (beta)", findMatchingRule(email({ subject: "has beta" }), [r])?.name, "Multi");
  check("neither term -> no match", findMatchingRule(email({ subject: "has gamma" }), [r]), null);
}
{
  const r = rule({ name: "Sender", conditions: { senderEmail: ["x@y.com"], senderDomain: ["z.com"] } });
  check("senderEmail OR senderDomain (email hit)",
    findMatchingRule(email({ from: "<x@y.com>" }), [r])?.name, "Sender");
  check("senderEmail OR senderDomain (domain hit)",
    findMatchingRule(email({ from: "<other@z.com>" }), [r])?.name, "Sender");
  check("neither sender -> no match", findMatchingRule(email({ from: "<no@no.com>" }), [r]), null);
}
check("condition-less rule never hard-matches",
  findMatchingRule(email(), [rule({ name: "AIOnly", conditions: {} })]), null);

console.log("\n[2] applyRuleConstraints — clamping");
{
  const r = rule({ name: "OnlyLabel", actions: { applyLabels: ["Statements"] } });
  const out = applyRuleConstraints(
    aiResult({ shouldMarkImportant: true, shouldSkipInbox: true, shouldMarkReadAndLabel: true,
               shouldBlockAndUnsubscribe: true, suggestedLabels: ["Statements"] }), r);
  check("markImportant clamped off", out.shouldMarkImportant, false);
  check("skipInbox clamped off", out.shouldSkipInbox, false);
  check("markReadAndLabel clamped off", out.shouldMarkReadAndLabel, false);
  check("blockAndUnsubscribe clamped off (was unclamped)", out.shouldBlockAndUnsubscribe, false);
  check("permitted label survives", out.suggestedLabels, ["Statements"]);
}
{
  const r = rule({ name: "Blocker", actions: { blockAndUnsubscribe: true } });
  check("blockAndUnsubscribe allowed when rule permits",
    applyRuleConstraints(aiResult({ shouldBlockAndUnsubscribe: true }), r).shouldBlockAndUnsubscribe, true);
}
{
  const r = rule({ name: "L", actions: { applyLabels: ["Cold Outreach"] } });
  check("invented label dropped",
    applyRuleConstraints(aiResult({ suggestedLabels: ["Newsletter"] }), r).suggestedLabels, []);
  check("case variant canonicalised to rule spelling",
    applyRuleConstraints(aiResult({ suggestedLabels: ["cold outreach"] }), r).suggestedLabels, ["Cold Outreach"]);
  check("duplicates collapsed",
    applyRuleConstraints(aiResult({ suggestedLabels: ["Cold Outreach", "cold outreach"] }), r).suggestedLabels, ["Cold Outreach"]);
}
{
  const out = applyRuleConstraints(
    aiResult({ shouldSkipInbox: true, shouldBlockAndUnsubscribe: true, suggestedLabels: ["X"] }), null);
  check("no match zeroes every action",
    [out.shouldSkipInbox, out.shouldBlockAndUnsubscribe, out.suggestedLabels, out.matchedRuleName],
    [false, false, [], ""]);
  check("no match preserves model reasoning", out.reasoning, "No rule matched: because");
}
{
  const out = applyRuleConstraints(aiResult({ isFinancialDocument: true, financialDocumentType: "invoice" }), null);
  check("financial detection survives clamping (always-on)",
    [out.isFinancialDocument, out.financialDocumentType], [true, "invoice"]);
}

console.log("\n[3] findRuleByName — hallucination handling");
{
  const rules = [rule({ name: "Prioritize OTPs" })];
  check("exact name resolves", findRuleByName("Prioritize OTPs", rules)?.name, "Prioritize OTPs");
  check("case/whitespace tolerant", findRuleByName("  prioritize otps ", rules)?.name, "Prioritize OTPs");
  check("hallucinated name -> null", findRuleByName("Some Invented Rule", rules), null);
  check("empty string -> null", findRuleByName("", rules), null);
  check("undefined -> null", findRuleByName(undefined, rules), null);
}

console.log("\n[4] pickHigherPriority");
{
  const high = rule({ name: "High", ruleId: "a", priority: 10 });
  const low = rule({ name: "Low", ruleId: "b", priority: 60 });
  const rules = [high, low];
  check("declared wins when higher priority", pickHigherPriority(low, high, rules)?.name, "High");
  check("condition wins when higher priority", pickHigherPriority(high, low, rules)?.name, "High");
  check("only condition match", pickHigherPriority(high, null, rules)?.name, "High");
  check("only declared match", pickHigherPriority(null, low, rules)?.name, "Low");
  check("neither -> null", pickHigherPriority(null, null, rules), null);
  check("same rule both ways", pickHigherPriority(high, high, rules)?.name, "High");
}

console.log("\n[5] evaluateHealth — failure detection");
{
  const NOW = new Date("2026-08-01T12:00:00Z").getTime();
  const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

  function account(p: Partial<GmailAccount> = {}): GmailAccount {
    return {
      pk: "USER#u", sk: "ACCOUNT#a", accountId: "a", userId: "u",
      email: "a@example.com", accessToken: "", refreshToken: "", tokenExpiry: 0,
      createdAt: "", updatedAt: "",
      ...p,
    } as GmailAccount;
  }

  function job(p: Partial<JobStatus> = {}): JobStatus {
    return {
      pk: "JOB#GLOBAL", sk: "STATUS", lastRunAt: minsAgo(1), status: "success",
      processedCount: 3, errorCount: 0, aiFailureCount: 0, updatedAt: "",
      ...p,
    } as JobStatus;
  }

  const healthy = evaluateHealth([account()], job(), NOW);
  check("all healthy -> ok", healthy.overall, "ok");
  check("all healthy -> no issues", healthy.issues.length, 0);
  check("healthy account marked connected", healthy.accounts[0].connected, true);

  const disconnected = evaluateHealth(
    [account({ syncError: "invalid_grant: token expired", syncErrorAt: minsAgo(30) })],
    job(),
    NOW
  );
  check("sync error -> error overall", disconnected.overall, "error");
  check("sync error -> account_disconnected issue", disconnected.issues[0].kind, "account_disconnected");
  check("sync error surfaces the message", disconnected.issues[0].detail, "invalid_grant: token expired");
  check("sync error -> account not connected", disconnected.accounts[0].connected, false);

  const aiDown = evaluateHealth([account()], job({ aiFailureCount: 7 }), NOW);
  check("ai failures -> error overall", aiDown.overall, "error");
  check("ai failures -> ai_failing issue", aiDown.issues.map((i) => i.kind), ["ai_failing"]);
  check("ai failure count in detail", aiDown.issues[0].detail.includes("7 emails"), true);
  check("ai failure count surfaced on job", aiDown.job.aiFailureCount, 7);

  const stale = evaluateHealth([account()], job({ lastRunAt: minsAgo(45) }), NOW);
  check("stale cron -> error overall", stale.overall, "error");
  check("stale cron -> job_stale issue", stale.issues.map((i) => i.kind), ["job_stale"]);
  check("stale cron -> stale flag", stale.job.stale, true);
  check("stale cron -> age in minutes", stale.job.ageMinutes, 45);

  const fresh = evaluateHealth([account()], job({ lastRunAt: minsAgo(10) }), NOW);
  check("10 min old is within threshold", fresh.job.stale, false);
  check("10 min old raises nothing", fresh.issues.length, 0);

  const never = evaluateHealth([account()], null, NOW);
  check("no job status -> warning", never.overall, "warning");
  check("no job status -> job_never_run", never.issues.map((i) => i.kind), ["job_never_run"]);
  check("no job status -> null age", never.job.ageMinutes, null);

  const multi = evaluateHealth(
    [account({ syncError: "boom" }), account({ accountId: "b", email: "b@example.com" })],
    job({ aiFailureCount: 2, lastRunAt: minsAgo(60) }),
    NOW
  );
  check("multiple faults all reported",
    multi.issues.map((i) => i.kind).sort(), ["account_disconnected", "ai_failing", "job_stale"]);
  check("healthy account unaffected by sibling failure", multi.accounts[1].connected, true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
