import { generateObject } from "ai";
import { z } from "zod";
import { CategorizationRule } from "./dynamodb";

// Define the categorization result schema
export const CategorizationResultSchema = z.object({
  shouldMarkImportant: z.boolean().describe("Whether the email should be marked as important/starred"),
  shouldPinConversation: z.boolean().describe("Whether the conversation should be pinned"),
  shouldSkipInbox: z.boolean().describe("Whether the email should skip the inbox (be archived)"),
  shouldMarkReadAndLabel: z.boolean().describe("Whether the email should be marked as read and moved to a label without archiving (keeps it searchable)"),
  shouldBlockAndUnsubscribe: z.boolean().describe("Whether to block the sender and unsubscribe from their emails"),
  suggestedLabels: z.array(z.string()).describe("Labels to apply from the user's defined rules only. Do not invent new labels."),
  matchedRuleId: z.string().describe("The rule id token (e.g. 'rule_2') of the single highest-priority rule this email matches, copied from the rule list. Empty string if no rule matches."),
  matchedRuleName: z.string().describe("The Name of that same rule, copied verbatim from the rule list. Empty string if no rule matches."),
  isFinancialDocument: z.boolean().describe("Whether this email contains or is a financial document such as an invoice, receipt, bank statement, credit card statement, tax document, or payment confirmation"),
  financialDocumentType: z.enum(["invoice", "receipt", "bank_statement", "credit_card_statement", "tax_document", "payment_confirmation", "none"]).describe("The type of financial document, or 'none' if not a financial document"),
  financialDocumentDescription: z.string().describe("A one-line human-readable description of the financial document including vendor/bank name, document type, date, and identifying details like card ending or account number. Empty string if not a financial document. Example: 'HDFC Bank credit card statement dated March 2026 for card ending 4521'"),
  reasoning: z.string().describe("Brief explanation of the categorization decision"),
  confidence: z.number().min(0).max(1).describe("Confidence score of the categorization (0-1)"),
});

export type CategorizationResult = z.infer<typeof CategorizationResultSchema>;

// How the winning rule was identified. "unresolved" means no rule was selected,
// so every action was dropped — the state that silently swallows an AI rule the
// model did decide to apply.
export type RuleResolution =
  | "conditions"
  | "rule_id"
  | "rule_name"
  | "labels"
  | "unresolved";

// What categorizeEmail actually returns: the model-shaped result plus runtime
// metadata about how it was produced. Kept off the schema so the model is never
// asked to fill it. aiFailed marks a silent degradation — rule matching still
// ran, but anything depending on the model was skipped.
//
// The declared* fields preserve what the model claimed before clamping. Without
// them a dropped decision is indistinguishable from the model never making one,
// which is exactly what made this class of bug invisible in the logs.
export interface CategorizationOutcome extends CategorizationResult {
  aiFailed?: boolean;
  aiError?: string;
  declaredRuleId?: string;
  declaredRuleName?: string;
  declaredLabels?: string[];
  ruleResolution?: RuleResolution;
  droppedLabels?: string[];
}

// Email data interface
export interface EmailData {
  from: string;
  subject: string;
  body: string;
  snippet: string;
}

// Build system prompt for AI categorization
export function buildSystemPrompt(rules: CategorizationRule[]): string {
  let prompt = `You are an intelligent email categorization assistant. Your job is to analyze incoming emails and suggest appropriate actions based on the user's defined rules.

Available actions:
1. Mark as important (star the email)
2. Pin conversation
3. Skip inbox (archive the email)
4. Mark as read and move to label (keeps email searchable, doesn't archive)
5. Block sender and unsubscribe (blocks future emails and attempts to unsubscribe)
6. Apply custom labels

User's rules (in priority order):
`;

  rules.forEach((rule, index) => {
    // Stable positional token. The model echoes this back instead of retyping a
    // free-text name, which is the identifier it can actually reproduce exactly.
    prompt += `\n${ruleToken(index)}`;
    prompt += `\n   Name: ${rule.name}`;
    prompt += `\n   Priority: ${rule.priority}`;

    if (!ruleHasConditions(rule)) {
      prompt += `\n   Matching: judgment only — this rule has no literal conditions. Decide from its Name and AI Instructions below. Nothing else can match it for you.`;
    }

    if (ruleHasConditions(rule)) {
      prompt += "\n   Conditions:";
      if (rule.conditions.senderEmail?.length) {
        prompt += `\n   - Sender emails: ${rule.conditions.senderEmail.join(", ")}`;
      }
      if (rule.conditions.senderDomain?.length) {
        prompt += `\n   - Sender domains: ${rule.conditions.senderDomain.join(", ")}`;
      }
      if (rule.conditions.subjectContains?.length) {
        prompt += `\n   - Subject contains: ${rule.conditions.subjectContains.join(", ")}`;
      }
      if (rule.conditions.bodyContains?.length) {
        prompt += `\n   - Body contains: ${rule.conditions.bodyContains.join(", ")}`;
      }
    }

    prompt += "\n   Actions:";
    if (rule.actions.markImportant) prompt += "\n   - Mark as important";
    if (rule.actions.pinConversation) prompt += "\n   - Pin conversation";
    if (rule.actions.skipInbox) prompt += "\n   - Skip inbox";
    if (rule.actions.markReadAndLabel) prompt += "\n   - Mark as read and move to label";
    if (rule.actions.blockAndUnsubscribe) prompt += "\n   - Block sender and unsubscribe";
    if (rule.actions.applyLabels?.length) {
      prompt += `\n   - Apply labels: ${rule.actions.applyLabels.join(", ")}`;
    }

    if (rule.aiPrompt) {
      prompt += `\n   AI Instructions: ${rule.aiPrompt}`;
    }

    prompt += "\n";
  });

  // Collect all valid labels from rules
  const validLabels = new Set<string>();
  rules.forEach((rule) => {
    if (rule.actions.applyLabels?.length) {
      rule.actions.applyLabels.forEach((label) => validLabels.add(label));
    }
  });

  if (validLabels.size > 0) {
    prompt += `\nAllowed labels (ONLY use these, do not invent new ones): ${[...validLabels].join(", ")}`;
  } else {
    prompt += `\nNo labels are defined in the rules. Do not suggest any labels.`;
  }

  prompt += `\nAnalyze the email and determine which actions should be applied based on the rules above.

How to decide whether a rule matches:
- A rule that lists Conditions matches only when the email satisfies them.
- A rule marked "Matching: judgment only" has no conditions to check. It matches when the email fits what its
  Name and AI Instructions describe. You are the only thing that can match these rules — the absence of
  conditions is never a reason to say the rule did not match.
- A rule with both Conditions and AI Instructions matches when the conditions hold and your judgment agrees.
When multiple rules match, apply actions only from the highest-priority (earliest listed) rule.
Do not invent labels or actions beyond what the matching rule specifies.
If genuinely no rule applies, return no actions (all booleans false, empty labels) and explain why.

You MUST identify the rule you applied in BOTH fields:
- matchedRuleId: the rule token, e.g. "rule_2" — copy it exactly as written above.
- matchedRuleName: that same rule's Name, copied verbatim.
Set both to the empty string only when no rule applies. Actions are validated against the identified rule and
silently dropped if that rule does not permit them, so failing to identify the rule discards your entire
decision — including any labels you asked for.

IMPORTANT - Financial Document Detection (always-on, independent of rules):
You MUST always analyze whether the email is a financial document (invoice, receipt, bank statement, credit card statement, tax document, or payment confirmation). Set isFinancialDocument, financialDocumentType, and financialDocumentDescription accordingly.
- If it IS a financial document, set isFinancialDocument=true, financialDocumentType to the appropriate type, and financialDocumentDescription to a concise one-line summary including the vendor/bank name, document type, date, and any identifying details (e.g. card ending, account number last 4 digits).
- If it is NOT a financial document, set isFinancialDocument=false, financialDocumentType="none", financialDocumentDescription="".
This detection is independent of user-created rules and must always be performed.`;

  return prompt;
}

function extractSenderDetails(from: string) {
  const normalizedFrom = from.toLowerCase();
  const senderEmailMatch = normalizedFrom.match(/<(.+?)>/);
  const senderEmail = senderEmailMatch ? senderEmailMatch[1] : normalizedFrom;
  const senderDomain = senderEmail.split("@")[1] || "";

  return { senderEmail, senderDomain };
}

type RuleWithConditions = CategorizationRule & {
  conditions: NonNullable<CategorizationRule["conditions"]>;
};

function ruleHasConditions(rule: CategorizationRule): rule is RuleWithConditions {
  const conditions = rule.conditions;
  if (!conditions) return false;

  return Boolean(
    (conditions.senderEmail && conditions.senderEmail.length > 0) ||
      (conditions.senderDomain && conditions.senderDomain.length > 0) ||
      (conditions.subjectContains && conditions.subjectContains.length > 0) ||
      (conditions.bodyContains && conditions.bodyContains.length > 0)
  );
}

export function findMatchingRule(
  email: EmailData,
  rules: CategorizationRule[]
): CategorizationRule | null {
  const emailLower = {
    from: email.from.toLowerCase(),
    subject: email.subject.toLowerCase(),
    body: email.body.toLowerCase(),
  };

  const { senderEmail, senderDomain } = extractSenderDetails(email.from);

  for (const rule of rules) {
    // AI-only rules (no hard conditions) — skip condition matching,
    // these are evaluated by the AI model instead
    if (!ruleHasConditions(rule)) {
      continue;
    }

    const conditions = rule.conditions;

    // Each group is OR'd internally; the groups are AND'd together, so a rule
    // specifying both a sender and a subject requires both to hold.
    const groups: boolean[] = [];

    // Sender email and domain describe the same field, so they OR with each other.
    if (conditions?.senderEmail?.length || conditions?.senderDomain?.length) {
      const emailMatches =
        conditions.senderEmail?.some((ruleEmail) =>
          senderEmail.includes(ruleEmail.toLowerCase())
        ) ?? false;
      const domainMatches =
        conditions.senderDomain?.some((domain) =>
          senderDomain.includes(domain.toLowerCase())
        ) ?? false;
      groups.push(emailMatches || domainMatches);
    }

    if (conditions?.subjectContains?.length) {
      groups.push(
        conditions.subjectContains.some((keyword) =>
          emailLower.subject.includes(keyword.toLowerCase())
        )
      );
    }

    if (conditions?.bodyContains?.length) {
      groups.push(
        conditions.bodyContains.some((keyword) =>
          emailLower.body.includes(keyword.toLowerCase())
        )
      );
    }

    if (groups.length > 0 && groups.every(Boolean)) {
      return rule;
    }
  }

  return null;
}

export function ruleToken(index: number): string {
  return `rule_${index + 1}`;
}

// Resolve the rule token the model reported. Positional, so it survives any
// rule name the model would otherwise have to retype character for character.
export function findRuleById(
  id: string | undefined,
  rules: CategorizationRule[]
): CategorizationRule | null {
  const raw = id?.trim();
  if (!raw) return null;

  // Accept a real ruleId too, in case the model quotes one from elsewhere.
  const byRuleId = rules.find((rule) => rule.ruleId === raw);
  if (byRuleId) return byRuleId;

  const match = raw.match(/^\[?rule[_\s-]?(\d+)\]?$/i) ?? raw.match(/^(\d+)$/);
  if (!match) return null;

  return rules[Number(match[1]) - 1] ?? null;
}

// Strip the decoration a model tends to add around a name it is copying: list
// numbering, the rule token, surrounding quotes, a trailing type/priority
// parenthetical. Without this, "1. Cold Outreach" fails to resolve and the whole
// categorization is discarded.
function normalizeRuleName(value: string): string {
  return value
    .trim()
    .replace(/^\[?rule[_\s-]?\d+\]?\s*[:.)-]*\s*/i, "")
    .replace(/^\d+\s*[.)]\s*/, "")
    .replace(/\s*\((?:AI|condition|hybrid)\b[^)]*\)\s*$/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim()
    .toLowerCase();
}

// Resolve the rule name the model reported back to a real rule. Returns null for
// an empty name or a hallucinated one, which collapses to "no rule matched".
export function findRuleByName(
  name: string | undefined,
  rules: CategorizationRule[]
): CategorizationRule | null {
  const normalized = normalizeRuleName(name ?? "");
  if (!normalized) return null;

  const exact = rules.find((rule) => normalizeRuleName(rule.name) === normalized);
  if (exact) return exact;

  // Last resort: an unambiguous containment match, so "Cold Outreach" still
  // resolves to "Cold Outreach (auto-archive)". Short names are excluded because
  // they collide with unrelated rules far too easily.
  if (normalized.length < 4) return null;

  const candidates = rules.filter((rule) => {
    const ruleName = normalizeRuleName(rule.name);
    if (ruleName.length < 4) return false;
    return ruleName.includes(normalized) || normalized.includes(ruleName);
  });

  return candidates.length === 1 ? candidates[0] : null;
}

// Recovery path for the case this whole layer keeps getting wrong: the model
// clearly decided (it asked for a label that only one rule defines) but failed
// to identify the rule. The labels were already constrained to rule-defined ones
// by the prompt, so owning a suggested label is a real signal of intent — and
// the recovered rule still clamps the actions, so this can never grant more than
// the rule itself permits. Rules arrive in priority order; the first owner wins.
export function findRuleBySuggestedLabels(
  labels: string[] | undefined,
  rules: CategorizationRule[]
): CategorizationRule | null {
  const wanted = new Set(
    (labels ?? []).map((label) => label.trim().toLowerCase()).filter(Boolean)
  );
  if (wanted.size === 0) return null;

  return (
    rules.find((rule) =>
      rule.actions.applyLabels?.some((label) => wanted.has(label.trim().toLowerCase()))
    ) ?? null
  );
}

// Rules arrive sorted ascending by priority, so the lower index is higher priority.
// Ties favour the condition match, which is deterministic.
export function pickHigherPriority(
  conditionMatch: CategorizationRule | null,
  declaredMatch: CategorizationRule | null,
  rules: CategorizationRule[]
): CategorizationRule | null {
  if (!conditionMatch) return declaredMatch;
  if (!declaredMatch) return conditionMatch;

  return rules.indexOf(declaredMatch) < rules.indexOf(conditionMatch)
    ? declaredMatch
    : conditionMatch;
}

export function applyRuleConstraints(
  categorization: CategorizationResult,
  matchedRule: CategorizationRule | null
): CategorizationOutcome {
  const declaredLabels = categorization.suggestedLabels ?? [];

  if (!matchedRule) {
    // Say which rule the model claimed, if any. "No rule matched" on its own
    // reads as "the model saw nothing here", which is the opposite of what
    // happened when it named a rule that failed to resolve.
    const claimed = categorization.matchedRuleName?.trim();
    const prefix = claimed
      ? `No rule matched (the model named "${claimed}", which is not one of your rules)`
      : "No rule matched";

    return {
      ...categorization,
      shouldMarkImportant: false,
      shouldPinConversation: false,
      shouldSkipInbox: false,
      shouldMarkReadAndLabel: false,
      shouldBlockAndUnsubscribe: false,
      suggestedLabels: [],
      matchedRuleId: "",
      matchedRuleName: "",
      declaredLabels,
      droppedLabels: declaredLabels,
      reasoning: categorization.reasoning
        ? `${prefix}: ${categorization.reasoning}`
        : prefix,
    };
  }

  // Map lowercased label -> the rule's canonical spelling, so a case variant from
  // the model resolves to the existing Gmail label instead of creating a new one.
  const allowedLabels = new Map(
    matchedRule.actions.applyLabels?.map((label) => [label.trim().toLowerCase(), label]) ?? []
  );

  const suggestedLabels = [
    ...new Set(
      declaredLabels
        .map((label) => allowedLabels.get(label.trim().toLowerCase()))
        .filter((label): label is string => label !== undefined)
    ),
  ];

  const droppedLabels = declaredLabels.filter(
    (label) => !allowedLabels.has(label.trim().toLowerCase())
  );

  return {
    ...categorization,
    declaredLabels,
    droppedLabels,
    shouldMarkImportant:
      Boolean(categorization.shouldMarkImportant) &&
      Boolean(matchedRule.actions.markImportant),
    shouldPinConversation:
      Boolean(categorization.shouldPinConversation) &&
      Boolean(matchedRule.actions.pinConversation),
    shouldSkipInbox:
      Boolean(categorization.shouldSkipInbox) &&
      Boolean(matchedRule.actions.skipInbox),
    shouldMarkReadAndLabel:
      Boolean(categorization.shouldMarkReadAndLabel) &&
      Boolean(matchedRule.actions.markReadAndLabel),
    shouldBlockAndUnsubscribe:
      Boolean(categorization.shouldBlockAndUnsubscribe) &&
      Boolean(matchedRule.actions.blockAndUnsubscribe),
    suggestedLabels,
    matchedRuleId: matchedRule.ruleId,
    matchedRuleName: matchedRule.name,
    reasoning: matchedRule.name
      ? `Matched rule: ${matchedRule.name} — ${categorization.reasoning}`
      : categorization.reasoning,
  };
}

// Turn a raw model result into a clamped outcome, recording how the rule was
// found. Four independent routes, tried strongest first:
//   1. hard conditions evaluated locally — deterministic, never involves the model
//   2. the rule token the model echoed back
//   3. the rule name the model wrote out
//   4. the rule that owns the labels the model asked for
// Routes 2-4 are the only way a condition-less AI rule can ever fire. Every route
// ends in applyRuleConstraints, so the model can never exceed what the rule allows.
export function resolveOutcome(
  email: EmailData,
  result: CategorizationResult,
  enabledRules: CategorizationRule[]
): CategorizationOutcome {
  const conditionMatch = findMatchingRule(email, enabledRules);

  const idMatch = findRuleById(result.matchedRuleId, enabledRules);
  const nameMatch = findRuleByName(result.matchedRuleName, enabledRules);
  const declaredMatch = idMatch ?? nameMatch;

  // Whichever of conditions/declaration is higher priority wins; enabledRules is
  // sorted ascending by priority, so the earlier index is the stronger claim.
  let matchedRule = pickHigherPriority(conditionMatch, declaredMatch, enabledRules);
  let resolvedVia: RuleResolution = "unresolved";

  if (matchedRule && matchedRule === conditionMatch) {
    resolvedVia = "conditions";
  } else if (matchedRule) {
    resolvedVia = matchedRule === idMatch ? "rule_id" : "rule_name";
  } else {
    const labelMatch = findRuleBySuggestedLabels(result.suggestedLabels, enabledRules);
    if (labelMatch) {
      matchedRule = labelMatch;
      resolvedVia = "labels";
    }
  }

  return {
    ...applyRuleConstraints(result, matchedRule),
    declaredRuleId: result.matchedRuleId ?? "",
    declaredRuleName: result.matchedRuleName ?? "",
    ruleResolution: resolvedVia,
  };
}

// Categorize email using AI
export async function categorizeEmail(
  email: EmailData,
  rules: CategorizationRule[]
): Promise<CategorizationOutcome> {
  // Filter only enabled rules
  const enabledRules = rules.filter((rule) => rule.enabled);

  if (enabledRules.length === 0) {
    // No rules, return default categorization
    return {
      shouldMarkImportant: false,
      shouldPinConversation: false,
      shouldSkipInbox: false,
      shouldMarkReadAndLabel: false,
      shouldBlockAndUnsubscribe: false,
      suggestedLabels: [],
      isFinancialDocument: false,
      financialDocumentType: "none",
      financialDocumentDescription: "",
      matchedRuleId: "",
      matchedRuleName: "",
      reasoning: "No active rules configured",
      confidence: 1.0,
      ruleResolution: "unresolved",
    };
  }

  const systemPrompt = buildSystemPrompt(enabledRules);
  const userPrompt = `Email to categorize:

From: ${email.from}
Subject: ${email.subject}
Preview: ${email.snippet}

Full content:
${email.body.substring(0, 2000)}${email.body.length > 2000 ? "..." : ""}

Based on the rules, what actions should be applied to this email?`;

  try {
    // Use Vercel AI Gateway with structured output
    // Model format: "provider/model" (AI Gateway handles routing automatically)
    // The AI_GATEWAY_API_KEY environment variable is used for authentication
    const result = await generateObject({
      model: "openai/gpt-4o-mini",
      system: systemPrompt,
      prompt: userPrompt,
      schema: CategorizationResultSchema,
      temperature: 0.3,
    });

    return resolveOutcome(email, result.object, enabledRules);
  } catch (error) {
    console.error("Error categorizing email with AI:", error);

    // Fallback to rule-based categorization if AI fails. This degrades silently
    // from the caller's perspective, so flag it — condition-less rules cannot
    // match here at all, meaning AI-driven rules simply stop working.
    return {
      ...fallbackCategorization(email, enabledRules),
      aiFailed: true,
      aiError: error instanceof Error ? error.message : String(error),
    };
  }
}

// Fallback rule-based categorization (without AI)
function fallbackCategorization(
  email: EmailData,
  rules: CategorizationRule[]
): CategorizationOutcome {
  const result: CategorizationOutcome = {
    shouldMarkImportant: false,
    shouldPinConversation: false,
    shouldSkipInbox: false,
    shouldMarkReadAndLabel: false,
    shouldBlockAndUnsubscribe: false,
    suggestedLabels: [],
    isFinancialDocument: false,
    financialDocumentType: "none",
    financialDocumentDescription: "",
    matchedRuleId: "",
    matchedRuleName: "",
    reasoning: "Rule-based categorization (AI unavailable)",
    confidence: 0.7,
  };

  const matchedRule = findMatchingRule(email, rules);

  if (!matchedRule) {
    // Condition-less AI rules cannot be evaluated without the model, so this is
    // "we could not check", not "nothing applies".
    result.reasoning = "No rule conditions matched (AI unavailable)";
    result.confidence = 1.0;
    result.ruleResolution = "unresolved";
  } else {
    result.ruleResolution = "conditions";
    if (matchedRule.actions.markImportant) {
      result.shouldMarkImportant = true;
    }
    if (matchedRule.actions.pinConversation) {
      result.shouldPinConversation = true;
    }
    if (matchedRule.actions.skipInbox) {
      result.shouldSkipInbox = true;
    }
    if (matchedRule.actions.markReadAndLabel) {
      result.shouldMarkReadAndLabel = true;
    }
    if (matchedRule.actions.blockAndUnsubscribe) {
      result.shouldBlockAndUnsubscribe = true;
    }
    if (matchedRule.actions.applyLabels?.length) {
      result.suggestedLabels.push(...matchedRule.actions.applyLabels);
    }
    result.matchedRuleId = matchedRule.ruleId;
    result.matchedRuleName = matchedRule.name;
    result.reasoning = `Matched rule: ${matchedRule.name} (AI unavailable)`;
    result.suggestedLabels = [...new Set(result.suggestedLabels)];
  }

  // Fallback financial document detection (keyword-based, always-on)
  const emailLower = {
    subject: email.subject.toLowerCase(),
    body: email.body.toLowerCase(),
  };
  const combined = `${emailLower.subject} ${emailLower.body}`;
  const invoiceKeywords = ["invoice", "bill", "payment due", "amount due", "billing statement"];
  const bankKeywords = ["bank statement", "account statement", "transaction summary", "account summary"];
  const ccKeywords = ["credit card statement", "card statement", "card ending", "minimum payment", "statement balance"];
  const receiptKeywords = ["receipt", "payment confirmation", "payment received", "order confirmation"];
  const taxKeywords = ["tax return", "tax document", "form 1099", "form w-2", "tax statement"];

  if (invoiceKeywords.some((kw) => combined.includes(kw))) {
    result.isFinancialDocument = true;
    result.financialDocumentType = "invoice";
    result.financialDocumentDescription = `Invoice from ${email.from} - ${email.subject}`;
  } else if (ccKeywords.some((kw) => combined.includes(kw))) {
    result.isFinancialDocument = true;
    result.financialDocumentType = "credit_card_statement";
    result.financialDocumentDescription = `Credit card statement from ${email.from} - ${email.subject}`;
  } else if (bankKeywords.some((kw) => combined.includes(kw))) {
    result.isFinancialDocument = true;
    result.financialDocumentType = "bank_statement";
    result.financialDocumentDescription = `Bank statement from ${email.from} - ${email.subject}`;
  } else if (receiptKeywords.some((kw) => combined.includes(kw))) {
    result.isFinancialDocument = true;
    result.financialDocumentType = "receipt";
    result.financialDocumentDescription = `Receipt from ${email.from} - ${email.subject}`;
  } else if (taxKeywords.some((kw) => combined.includes(kw))) {
    result.isFinancialDocument = true;
    result.financialDocumentType = "tax_document";
    result.financialDocumentDescription = `Tax document from ${email.from} - ${email.subject}`;
  }

  return result;
}

// Gmail query conversion schema
const GmailQuerySchema = z.object({
  query: z.string().describe("The Gmail search query string using Gmail search operators"),
  explanation: z.string().describe("Brief explanation of what the query searches for"),
});

export type GmailQueryResult = z.infer<typeof GmailQuerySchema>;

const GMAIL_QUERY_SYSTEM_PROMPT = `You are a Gmail search query builder. Convert natural language descriptions into Gmail search query syntax.

Gmail search operators:
- from:sender — emails from a sender (email or name)
- to:recipient — emails to a recipient
- subject:word — subject contains word. Use subject:(word1 OR word2) for multiple
- has:attachment — has file attachments
- filename:name — attachment filename or extension (e.g. filename:pdf)
- after:YYYY/MM/DD — emails after a date
- before:YYYY/MM/DD — emails before a date
- older_than:Nd / older_than:Nm / older_than:Ny — older than N days/months/years
- newer_than:Nd / newer_than:Nm / newer_than:Ny — newer than N days/months/years
- larger:5M / smaller:1M — by size
- is:read / is:unread / is:starred
- in:inbox / in:sent / in:trash
- label:name — has a specific label
- OR — boolean OR (must be uppercase)
- Parentheses for grouping: subject:(invoice OR receipt)
- Minus for exclusion: -from:noreply

Examples:
- "invoices from last 6 months" → "has:attachment subject:invoice newer_than:6m"
- "bank statements from HDFC in 2025" → "has:attachment from:hdfc subject:statement after:2025/01/01 before:2025/12/31"
- "credit card bills with PDF attachments" → "has:attachment subject:(credit card statement) filename:pdf"
- "receipts from Amazon" → "has:attachment from:amazon subject:(receipt OR order confirmation)"
- "tax documents from last year" → "has:attachment subject:(tax OR 1099 OR w-2) newer_than:1y"

Always include has:attachment since we are looking for financial documents with file attachments.
Return only the Gmail query syntax, no extra text in the query field.`;

export async function convertToGmailQuery(
  naturalLanguageQuery: string
): Promise<GmailQueryResult> {
  const result = await generateObject({
    model: "openai/gpt-4o-mini",
    system: GMAIL_QUERY_SYSTEM_PROMPT,
    prompt: `Convert this to a Gmail search query: "${naturalLanguageQuery}"`,
    schema: GmailQuerySchema,
    temperature: 0.2,
  });

  return result.object;
}
