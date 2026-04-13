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
  isFinancialDocument: z.boolean().describe("Whether this email contains or is a financial document such as an invoice, receipt, bank statement, credit card statement, tax document, or payment confirmation"),
  financialDocumentType: z.enum(["invoice", "receipt", "bank_statement", "credit_card_statement", "tax_document", "payment_confirmation", "none"]).describe("The type of financial document, or 'none' if not a financial document"),
  financialDocumentDescription: z.string().describe("A one-line human-readable description of the financial document including vendor/bank name, document type, date, and identifying details like card ending or account number. Empty string if not a financial document. Example: 'HDFC Bank credit card statement dated March 2026 for card ending 4521'"),
  reasoning: z.string().describe("Brief explanation of the categorization decision"),
  confidence: z.number().min(0).max(1).describe("Confidence score of the categorization (0-1)"),
});

export type CategorizationResult = z.infer<typeof CategorizationResultSchema>;

// Email data interface
export interface EmailData {
  from: string;
  subject: string;
  body: string;
  snippet: string;
}

// Build system prompt for AI categorization
function buildSystemPrompt(rules: CategorizationRule[]): string {
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
    prompt += `\n${index + 1}. ${rule.name} (${rule.type}, priority: ${rule.priority})`;

    if (rule.conditions) {
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
Only apply actions when the email matches at least one rule's conditions.
If no rule conditions match, return no actions (all booleans false, empty labels) and explain that no rules matched.
When multiple rules match, apply actions only from the highest-priority (earliest listed) rule.
Do not invent labels or actions beyond what the matching rule specifies.

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

function ruleHasConditions(rule: CategorizationRule) {
  const conditions = rule.conditions;
  if (!conditions) return false;

  return Boolean(
    (conditions.senderEmail && conditions.senderEmail.length > 0) ||
      (conditions.senderDomain && conditions.senderDomain.length > 0) ||
      (conditions.subjectContains && conditions.subjectContains.length > 0) ||
      (conditions.bodyContains && conditions.bodyContains.length > 0)
  );
}

function findMatchingRule(
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

    let matches = false;
    const conditions = rule.conditions;

    if (conditions?.senderEmail?.length) {
      const senderMatches = conditions.senderEmail.some((ruleEmail) =>
        senderEmail.includes(ruleEmail.toLowerCase())
      );
      if (senderMatches) matches = true;
    }

    if (conditions?.senderDomain?.length) {
      const domainMatches = conditions.senderDomain.some((domain) =>
        senderDomain.includes(domain.toLowerCase())
      );
      if (domainMatches) matches = true;
    }

    if (conditions?.subjectContains?.length) {
      const subjectMatches = conditions.subjectContains.some((keyword) =>
        emailLower.subject.includes(keyword.toLowerCase())
      );
      if (subjectMatches) matches = true;
    }

    if (conditions?.bodyContains?.length) {
      const bodyMatches = conditions.bodyContains.some((keyword) =>
        emailLower.body.includes(keyword.toLowerCase())
      );
      if (bodyMatches) matches = true;
    }

    if (matches) {
      return rule;
    }
  }

  return null;
}

function applyRuleConstraints(
  categorization: CategorizationResult,
  matchedRule: CategorizationRule | null
): CategorizationResult {
  if (!matchedRule) {
    return {
      ...categorization,
      shouldMarkImportant: false,
      shouldPinConversation: false,
      shouldSkipInbox: false,
      shouldMarkReadAndLabel: false,
      shouldBlockAndUnsubscribe: false,
      suggestedLabels: [],
      reasoning: "No rule conditions matched",
      confidence: 1.0,
    };
  }

  const allowedLabels = new Set(
    matchedRule.actions.applyLabels?.map((label) => label.toLowerCase()) ?? []
  );

  return {
    ...categorization,
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
    suggestedLabels: categorization.suggestedLabels.filter((label) =>
      allowedLabels.has(label.toLowerCase())
    ),
    reasoning: matchedRule.name ? `Matched rule: ${matchedRule.name}` : categorization.reasoning,
  };
}

// Categorize email using AI
export async function categorizeEmail(
  email: EmailData,
  rules: CategorizationRule[]
): Promise<CategorizationResult> {
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
      reasoning: "No active rules configured",
      confidence: 1.0,
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

    const matchedRule = findMatchingRule(email, enabledRules);

    // If no hard-condition rule matched, check if there are AI-only rules.
    // If so, trust the AI's categorization since the AI evaluated those rules.
    const hasAiOnlyRules = enabledRules.some(
      (rule) => !ruleHasConditions(rule) && (rule.type === "AI" || rule.aiPrompt)
    );

    if (!matchedRule && hasAiOnlyRules) {
      // AI made its decision based on AI-only rules — return as-is
      return result.object;
    }

    return applyRuleConstraints(result.object, matchedRule);
  } catch (error) {
    console.error("Error categorizing email with AI:", error);

    // Fallback to rule-based categorization if AI fails
    return fallbackCategorization(email, enabledRules);
  }
}

// Fallback rule-based categorization (without AI)
function fallbackCategorization(
  email: EmailData,
  rules: CategorizationRule[]
): CategorizationResult {
  const result: CategorizationResult = {
    shouldMarkImportant: false,
    shouldPinConversation: false,
    shouldSkipInbox: false,
    shouldMarkReadAndLabel: false,
    shouldBlockAndUnsubscribe: false,
    suggestedLabels: [],
    isFinancialDocument: false,
    financialDocumentType: "none",
    financialDocumentDescription: "",
    reasoning: "Rule-based categorization (AI unavailable)",
    confidence: 0.7,
  };

  const matchedRule = findMatchingRule(email, rules);

  if (!matchedRule) {
    result.reasoning = "No rule conditions matched";
    result.confidence = 1.0;
  } else {
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
    result.reasoning = `Matched rule: ${matchedRule.name}`;
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
