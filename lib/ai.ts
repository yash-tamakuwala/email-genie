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
