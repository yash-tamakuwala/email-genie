import { generateObject } from "ai";
import { z } from "zod";
import { CategorizationRule } from "./dynamodb";

// Define the categorization result schema
export const CategorizationResultSchema = z.object({
  shouldMarkImportant: z.boolean().describe("Whether the email should be marked as important/starred"),
  shouldPinConversation: z.boolean().describe("Whether the conversation should be pinned"),
  shouldSkipInbox: z.boolean().describe("Whether the email should skip the inbox (be archived)"),
  shouldMarkReadAndLabel: z.boolean().describe("Whether the email should be marked as read and moved to a label without archiving (keeps it searchable)"),
  suggestedLabels: z.array(z.string()).describe("Suggested custom labels to apply"),
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
5. Apply custom labels

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
    if (rule.actions.applyLabels?.length) {
      prompt += `\n   - Apply labels: ${rule.actions.applyLabels.join(", ")}`;
    }
    
    if (rule.aiPrompt) {
      prompt += `\n   AI Instructions: ${rule.aiPrompt}`;
    }
    
    prompt += "\n";
  });

  prompt += `\nAnalyze the email and determine which actions should be applied based on the rules above.
Only apply actions when the email matches at least one rule's conditions.
If no rule conditions match, return no actions (all booleans false, empty labels) and explain that no rules matched.
When multiple rules match, apply actions only from the highest-priority (earliest listed) rule.
Do not invent labels or actions beyond what the matching rule specifies.`;

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
      shouldMarkImportant: false,
      shouldPinConversation: false,
      shouldSkipInbox: false,
      shouldMarkReadAndLabel: false,
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
      suggestedLabels: [],
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
    suggestedLabels: [],
    reasoning: "Rule-based categorization (AI unavailable)",
    confidence: 0.7,
  };

  const matchedRule = findMatchingRule(email, rules);

  if (!matchedRule) {
    result.reasoning = "No rule conditions matched";
    result.confidence = 1.0;
    return result;
  }

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
  if (matchedRule.actions.applyLabels?.length) {
    result.suggestedLabels.push(...matchedRule.actions.applyLabels);
  }

  result.reasoning = `Matched rule: ${matchedRule.name}`;

  // Remove duplicate labels
  result.suggestedLabels = [...new Set(result.suggestedLabels)];

  return result;
}

// ─── Document Finder AI Functions ───

// Schema for translating natural language to Gmail search query
const GmailSearchQuerySchema = z.object({
  gmailQuery: z.string().describe(
    "Gmail search query optimized for finding the requested documents. MUST include 'has:attachment'. Use from:, subject:, OR operators as needed."
  ),
  reasoning: z.string().describe("Brief explanation of the search strategy"),
});

export type GmailSearchQuery = z.infer<typeof GmailSearchQuerySchema>;

// Translate a natural language query into a Gmail search string
export async function buildGmailSearchQuery(
  naturalLanguageQuery: string,
  dateFrom: string,
  dateTo: string
): Promise<GmailSearchQuery> {
  try {
    const result = await generateObject({
      model: "openai/gpt-4o-mini",
      system: `You are an expert at constructing Gmail search queries. Given a natural language description of documents to find, produce an optimized Gmail search query.

Rules:
- ALWAYS include "has:attachment" in the query
- Use "after:YYYY/MM/DD" and "before:YYYY/MM/DD" for date filtering
- Use from: for known sender domains (e.g. from:hdfcbank.net for HDFC)
- Use subject:() for subject keywords
- Use OR to combine alternative search strategies
- Keep queries focused — avoid overly broad terms
- For well-known companies, include their known email domains`,
      prompt: `Find documents matching: "${naturalLanguageQuery}"
Date range: ${dateFrom} to ${dateTo}

Generate the optimal Gmail search query.`,
      schema: GmailSearchQuerySchema,
      temperature: 0.2,
    });
    return result.object;
  } catch (error) {
    console.error("Error building Gmail search query:", error);
    // Fallback: simple keyword search
    const afterDate = dateFrom.replace(/-/g, "/");
    const beforeDate = dateTo.replace(/-/g, "/");
    return {
      gmailQuery: `has:attachment ${naturalLanguageQuery} after:${afterDate} before:${beforeDate}`,
      reasoning: "Fallback: using raw query terms with attachment filter",
    };
  }
}

// Schema for ranking email relevance to a document search
const DocumentRelevanceSchema = z.object({
  rankings: z.array(
    z.object({
      index: z.number().describe("Index of the email in the input array"),
      relevant: z.boolean().describe("Whether this email contains the requested document type"),
      confidence: z.number().min(0).max(1).describe("Confidence score"),
      reasoning: z.string().describe("Brief explanation"),
      passwordHint: z
        .string()
        .nullable()
        .describe(
          "If the email body mentions a password to open the attachment (e.g. 'Password is your DOB in DDMMYYYY format', 'Password: first 4 letters of PAN + DOB'), extract the EXACT password instruction text. Return null if no password info is found."
        ),
    })
  ),
});

export type DocumentRelevance = z.infer<typeof DocumentRelevanceSchema>;

// Rank a batch of emails by relevance to the user's document search query
export async function rankDocumentRelevance(
  emails: Array<{
    index: number;
    subject: string;
    sender: string;
    snippet: string;
    body: string;
    attachmentFilenames: string[];
  }>,
  query: string
): Promise<DocumentRelevance> {
  if (emails.length === 0) {
    return { rankings: [] };
  }

  try {
    const emailSummaries = emails
      .map(
        (e) =>
          `[${e.index}] From: ${e.sender} | Subject: ${e.subject} | Body: ${e.body.slice(0, 1000)} | Attachments: ${e.attachmentFilenames.join(", ") || "none"}`
      )
      .join("\n\n");

    const result = await generateObject({
      model: "openai/gpt-4o-mini",
      system: `You are a document relevance classifier. Given a user's search query and a list of emails with attachment info, determine which emails are relevant to the user's request.

Focus on:
- Whether attachments are actual documents (PDFs, spreadsheets) vs images/signatures
- Whether the email content matches the requested document type
- Whether the sender is plausible for the document type
- Ignore marketing emails, promotional content, and newsletters unless specifically requested

IMPORTANT - Password detection:
- Many financial documents (bank statements, credit card statements, tax documents) are password-protected PDFs
- The email body often contains instructions on what the password is (e.g. "Password is your date of birth in DDMMYYYY format", "Password: first 4 letters of your PAN number followed by DOB", "Your statement is protected. Use your Customer ID as password")
- Look for ANY mention of password, passcode, or how to open/unlock the attachment
- Extract the EXACT password instruction verbatim from the email body — do not paraphrase
- If no password instructions are found, set passwordHint to null`,
      prompt: `User is searching for: "${query}"

Emails to evaluate:
${emailSummaries}

Rate each email's relevance and extract any password hints for opening attachments.`,
      schema: DocumentRelevanceSchema,
      temperature: 0.2,
    });
    return result.object;
  } catch (error) {
    console.error("Error ranking document relevance:", error);
    // Fallback: mark all as relevant with low confidence
    return {
      rankings: emails.map((e) => ({
        index: e.index,
        relevant: true,
        confidence: 0.5,
        reasoning: "AI ranking unavailable, included by default",
        passwordHint: null,
      })),
    };
  }
}
