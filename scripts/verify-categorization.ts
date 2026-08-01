import {
  findMatchingRule,
  applyRuleConstraints,
  findRuleByName,
  findRuleById,
  findRuleBySuggestedLabels,
  pickHigherPriority,
  resolveOutcome,
  buildSystemPrompt,
  ruleToken,
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
    suggestedLabels: [], matchedRuleId: "", matchedRuleName: "", isFinancialDocument: false,
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
  check("no match records what was dropped", out.droppedLabels, ["X"]);
}
{
  // The reason line has to distinguish "the model saw nothing" from "the model
  // decided and we threw it away", or the failure is invisible in the logs.
  const out = applyRuleConstraints(
    aiResult({ matchedRuleName: "Cold Outreach", suggestedLabels: ["Cold Outreach"] }), null);
  check("unresolved claim is named in the reason", out.reasoning,
    'No rule matched (the model named "Cold Outreach", which is not one of your rules): because');
}
{
  const out = applyRuleConstraints(aiResult({ isFinancialDocument: true, financialDocumentType: "invoice" }), null);
  check("financial detection survives clamping (always-on)",
    [out.isFinancialDocument, out.financialDocumentType], [true, "invoice"]);
}

console.log("\n[3] findRuleByName — hallucination handling and copy decoration");
{
  const rules = [rule({ name: "Prioritize OTPs" })];
  check("exact name resolves", findRuleByName("Prioritize OTPs", rules)?.name, "Prioritize OTPs");
  check("case/whitespace tolerant", findRuleByName("  prioritize otps ", rules)?.name, "Prioritize OTPs");
  check("hallucinated name -> null", findRuleByName("Some Invented Rule", rules), null);
  check("empty string -> null", findRuleByName("", rules), null);
  check("undefined -> null", findRuleByName(undefined, rules), null);
}
{
  // Every one of these used to resolve to null and discard the categorization.
  const rules = [rule({ name: "Cold Outreach", type: "AI", conditions: {} })];
  check("list numbering stripped", findRuleByName("1. Cold Outreach", rules)?.name, "Cold Outreach");
  check("rule token prefix stripped", findRuleByName("rule_1: Cold Outreach", rules)?.name, "Cold Outreach");
  check("type/priority parenthetical stripped",
    findRuleByName("Cold Outreach (AI, priority: 100)", rules)?.name, "Cold Outreach");
  check("surrounding quotes stripped", findRuleByName("'Cold Outreach'", rules)?.name, "Cold Outreach");
}
{
  const rules = [rule({ name: "Cold Outreach (auto-archive)" })];
  check("unambiguous containment resolves",
    findRuleByName("Cold Outreach", rules)?.name, "Cold Outreach (auto-archive)");
}
{
  const rules = [rule({ name: "Cold Outreach EU", ruleId: "a" }), rule({ name: "Cold Outreach US", ruleId: "b" })];
  check("ambiguous containment -> null (never guess)", findRuleByName("Cold Outreach", rules), null);
}
{
  const rules = [rule({ name: "Newsletters" }), rule({ name: "OTP" })];
  check("short name never containment-matches", findRuleByName("New", rules), null);
}

console.log("\n[3b] findRuleById — positional token");
{
  const rules = [rule({ name: "First", ruleId: "id-1" }), rule({ name: "Second", ruleId: "id-2" })];
  check("rule_2 resolves positionally", findRuleById("rule_2", rules)?.name, "Second");
  check("bracketed token resolves", findRuleById("[rule_1]", rules)?.name, "First");
  check("bare index resolves", findRuleById("2", rules)?.name, "Second");
  check("real ruleId resolves", findRuleById("id-2", rules)?.name, "Second");
  check("out of range -> null", findRuleById("rule_9", rules), null);
  check("rule_0 -> null", findRuleById("rule_0", rules), null);
  check("empty -> null", findRuleById("", rules), null);
  check("garbage -> null", findRuleById("the cold outreach one", rules), null);
}

console.log("\n[3c] findRuleBySuggestedLabels — recovery from an unidentified rule");
{
  const rules = [
    rule({ name: "Statements", ruleId: "a", actions: { applyLabels: ["Statements"] } }),
    rule({ name: "Cold Outreach", ruleId: "b", conditions: {}, actions: { skipInbox: true, applyLabels: ["Cold Outreach"] } }),
  ];
  check("label owner found", findRuleBySuggestedLabels(["Cold Outreach"], rules)?.name, "Cold Outreach");
  check("case tolerant", findRuleBySuggestedLabels([" cold outreach "], rules)?.name, "Cold Outreach");
  check("unknown label -> null", findRuleBySuggestedLabels(["Promotions"], rules), null);
  check("no labels -> null", findRuleBySuggestedLabels([], rules), null);
  check("undefined -> null", findRuleBySuggestedLabels(undefined, rules), null);
  check("highest priority owner wins",
    findRuleBySuggestedLabels(["Statements", "Cold Outreach"], rules)?.name, "Statements");
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

console.log("\n[4b] resolveOutcome — the AI-only rule that silently did nothing");
{
  // Reproduces the reported bug: an AI rule (no conditions) whose actions were
  // dropped because the model's rule name did not resolve, leaving the email in
  // the inbox with no label while the reasoning said it should be archived.
  const coldOutreach = rule({
    name: "Cold Outreach",
    ruleId: "co",
    type: "AI",
    conditions: {},
    priority: 100,
    actions: { skipInbox: true, applyLabels: ["Cold Outreach"] },
    aiPrompt: "Unsolicited sales or PR pitches from people we have no relationship with",
  });
  const rules = [coldOutreach];
  const pitch = email({
    from: "Anya Novak <anya@headlinetcprpress.co>",
    subject: "Celebrity press coverage for Propelius Technologies",
    body: "I've been watching Propelius Technologies and aimed to reach out...",
  });

  const decided = {
    shouldSkipInbox: true,
    suggestedLabels: ["Cold Outreach"],
    reasoning: "unsolicited cold outreach",
  };

  const viaId = resolveOutcome(pitch, aiResult({ ...decided, matchedRuleId: "rule_1" }), rules);
  check("token identifies the rule", viaId.ruleResolution, "rule_id");
  check("token -> label applied", viaId.suggestedLabels, ["Cold Outreach"]);
  check("token -> archived", viaId.shouldSkipInbox, true);

  const viaName = resolveOutcome(
    pitch, aiResult({ ...decided, matchedRuleName: "1. Cold Outreach" }), rules);
  check("decorated name identifies the rule", viaName.ruleResolution, "rule_name");
  check("decorated name -> label applied", viaName.suggestedLabels, ["Cold Outreach"]);

  // The regression itself: model names nothing at all, but asks for a label only
  // this rule defines. Previously every action was discarded.
  const viaLabels = resolveOutcome(pitch, aiResult(decided), rules);
  check("bare label recovers the rule", viaLabels.ruleResolution, "labels");
  check("bare label -> label applied", viaLabels.suggestedLabels, ["Cold Outreach"]);
  check("bare label -> archived", viaLabels.shouldSkipInbox, true);
  check("bare label -> reason names the rule",
    viaLabels.reasoning, "Matched rule: Cold Outreach — unsolicited cold outreach");

  // Recovery must not become a bypass: the rule still clamps the actions.
  const overreach = resolveOutcome(
    pitch,
    aiResult({ ...decided, shouldBlockAndUnsubscribe: true, shouldMarkImportant: true }),
    rules
  );
  check("recovered rule still clamps blockAndUnsubscribe", overreach.shouldBlockAndUnsubscribe, false);
  check("recovered rule still clamps markImportant", overreach.shouldMarkImportant, false);

  // And a genuinely unmatched email stays unmatched.
  const noDecision = resolveOutcome(pitch, aiResult({ reasoning: "ordinary reply" }), rules);
  check("no decision stays unresolved", noDecision.ruleResolution, "unresolved");
  check("no decision applies nothing", noDecision.suggestedLabels, []);
  check("invented label does not recover a rule",
    resolveOutcome(pitch, aiResult({ suggestedLabels: ["Promotions"] }), rules).ruleResolution,
    "unresolved");
}
{
  // Conditions stay authoritative and are still reported as such.
  const rules = [rule({ name: "Upwork", ruleId: "u", conditions: { senderDomain: ["upwork.com"] },
    actions: { markImportant: true } })];
  const out = resolveOutcome(
    email({ from: "<jobs@upwork.com>" }), aiResult({ shouldMarkImportant: true }), rules);
  check("condition match reported as conditions", out.ruleResolution, "conditions");
  check("condition match applies the action", out.shouldMarkImportant, true);
}
{
  // The raw claim survives clamping so a failure is diagnosable from the log.
  const out = resolveOutcome(
    email(), aiResult({ matchedRuleName: "Ghost Rule", matchedRuleId: "rule_7" }), [rule({ name: "Real" })]);
  check("declared name preserved", out.declaredRuleName, "Ghost Rule");
  check("declared id preserved", out.declaredRuleId, "rule_7");
  check("resolution marked unresolved", out.ruleResolution, "unresolved");
}

console.log("\n[4c] buildSystemPrompt — what the model is actually told");
{
  const rules = [
    rule({ name: "Prioritize OTPs", ruleId: "a", type: "condition", priority: 10,
      conditions: { subjectContains: ["otp"] }, actions: { markImportant: true } }),
    rule({ name: "Cold Outreach", ruleId: "b", type: "AI", priority: 100, conditions: {},
      actions: { skipInbox: true, applyLabels: ["Cold Outreach"] },
      aiPrompt: "Unsolicited sales or PR pitches" }),
  ];
  const prompt = buildSystemPrompt(rules);

  check("rules carry a copyable token", prompt.includes(ruleToken(1)), true);
  check("condition-less rule is explained, not left conditionless",
    prompt.includes("Matching: judgment only"), true);
  check("condition-less rule shows no empty Conditions header",
    /Matching: judgment only[^]*?\n   Conditions:/.test(prompt), false);
  check("model is told to fill both identity fields",
    prompt.includes("matchedRuleId") && prompt.includes("matchedRuleName"), true);
  // The instruction that caused the bug: it told the model to return nothing
  // whenever no *conditions* matched, which is always true for an AI rule.
  check("no longer gates every action on conditions matching",
    prompt.includes("Only apply actions when the email matches at least one rule's conditions"), false);
  check("no longer tells the model to give up when conditions do not match",
    prompt.includes("If no rule conditions match, return no actions"), false);
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
