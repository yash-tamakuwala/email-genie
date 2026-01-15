import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

// Initialize DynamoDB Client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

// Create Document Client for easier operations
export const dynamoDb = DynamoDBDocumentClient.from(client);

// Table name helpers
const TABLE_PREFIX = process.env.DYNAMODB_TABLE_PREFIX || "email-genie";

export const TABLES = {
  GMAIL_ACCOUNTS: `${TABLE_PREFIX}-gmail-accounts`,
  CATEGORIZATION_RULES: `${TABLE_PREFIX}-categorization-rules`,
  EMAIL_LOGS: `${TABLE_PREFIX}-email-logs`,
};

// Type definitions
export interface GmailAccount {
  pk: string; // USER#userId
  sk: string; // ACCOUNT#accountId
  accountId: string;
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  lastEmailCheck?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategorizationRule {
  pk: string; // USER#userId (global rules)
  sk: string; // RULE#ruleId
  ruleId: string;
  userId: string;
  accountIds: string[]; // Array of account IDs this rule applies to
  name: string;
  type: "AI" | "condition" | "hybrid";
  conditions?: {
    senderEmail?: string[];
    senderDomain?: string[];
    subjectContains?: string[];
    bodyContains?: string[];
  };
  actions: {
    markImportant?: boolean;
    pinConversation?: boolean;
    skipInbox?: boolean;
    applyLabels?: string[];
  };
  aiPrompt?: string;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailLog {
  pk: string; // ACCOUNT#accountId#date
  sk: string; // EMAIL#emailId#timestamp
  accountId: string;
  messageId: string;
  emailId: string;
  sender: string;
  subject: string;
  appliedActions: string[];
  ruleMatched?: string;
  categorization?: string;
  processedAt: string;
  ttl: number; // Unix timestamp for TTL
}

export interface JobStatus {
  pk: string; // JOB#GLOBAL
  sk: string; // STATUS
  lastRunAt: string;
  status: "success" | "partial" | "error" | "running";
  processedCount: number;
  errorCount: number;
  message?: string;
  updatedAt: string;
}

// Helper functions for Gmail Accounts
export async function createGmailAccount(account: Omit<GmailAccount, "pk" | "sk" | "createdAt" | "updatedAt">) {
  const now = new Date().toISOString();
  const item: GmailAccount = {
    ...account,
    pk: `USER#${account.userId}`,
    sk: `ACCOUNT#${account.accountId}`,
    lastEmailCheck: account.lastEmailCheck ?? undefined,
    createdAt: now,
    updatedAt: now,
  };

  await dynamoDb.send(
    new PutCommand({
      TableName: TABLES.GMAIL_ACCOUNTS,
      Item: item,
    })
  );

  return item;
}

export async function getGmailAccount(userId: string, accountId: string): Promise<GmailAccount | null> {
  const result = await dynamoDb.send(
    new GetCommand({
      TableName: TABLES.GMAIL_ACCOUNTS,
      Key: {
        pk: `USER#${userId}`,
        sk: `ACCOUNT#${accountId}`,
      },
    })
  );

  return (result.Item as GmailAccount) || null;
}

export async function listGmailAccounts(userId: string): Promise<GmailAccount[]> {
  const result = await dynamoDb.send(
    new QueryCommand({
      TableName: TABLES.GMAIL_ACCOUNTS,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": `USER#${userId}`,
      },
    })
  );

  return (result.Items as GmailAccount[]) || [];
}

export async function updateGmailAccountTokens(
  userId: string,
  accountId: string,
  accessToken: string,
  refreshToken: string,
  tokenExpiry: number
) {
  await dynamoDb.send(
    new UpdateCommand({
      TableName: TABLES.GMAIL_ACCOUNTS,
      Key: {
        pk: `USER#${userId}`,
        sk: `ACCOUNT#${accountId}`,
      },
      UpdateExpression: "SET accessToken = :at, refreshToken = :rt, tokenExpiry = :te, updatedAt = :ua",
      ExpressionAttributeValues: {
        ":at": accessToken,
        ":rt": refreshToken,
        ":te": tokenExpiry,
        ":ua": new Date().toISOString(),
      },
    })
  );
}

export async function updateGmailAccountLastCheck(
  userId: string,
  accountId: string,
  lastEmailCheck: number
) {
  await dynamoDb.send(
    new UpdateCommand({
      TableName: TABLES.GMAIL_ACCOUNTS,
      Key: {
        pk: `USER#${userId}`,
        sk: `ACCOUNT#${accountId}`,
      },
      UpdateExpression: "SET lastEmailCheck = :lec, updatedAt = :ua",
      ExpressionAttributeValues: {
        ":lec": lastEmailCheck,
        ":ua": new Date().toISOString(),
      },
    })
  );
}

export async function deleteGmailAccount(userId: string, accountId: string) {
  await dynamoDb.send(
    new DeleteCommand({
      TableName: TABLES.GMAIL_ACCOUNTS,
      Key: {
        pk: `USER#${userId}`,
        sk: `ACCOUNT#${accountId}`,
      },
    })
  );
}

export async function setJobStatus(status: Omit<JobStatus, "pk" | "sk" | "updatedAt">) {
  const now = new Date().toISOString();
  const item: JobStatus = {
    ...status,
    pk: "JOB#GLOBAL",
    sk: "STATUS",
    updatedAt: now,
  };

  await dynamoDb.send(
    new PutCommand({
      TableName: TABLES.GMAIL_ACCOUNTS,
      Item: item,
    })
  );

  return item;
}

export async function getJobStatus(): Promise<JobStatus | null> {
  const result = await dynamoDb.send(
    new GetCommand({
      TableName: TABLES.GMAIL_ACCOUNTS,
      Key: {
        pk: "JOB#GLOBAL",
        sk: "STATUS",
      },
    })
  );

  return (result.Item as JobStatus) || null;
}

// Helper functions for Categorization Rules
export async function createCategorizationRule(
  rule: Omit<CategorizationRule, "pk" | "sk" | "createdAt" | "updatedAt">
) {
  const now = new Date().toISOString();
  const item: CategorizationRule = {
    ...rule,
    pk: `USER#${rule.userId}`,
    sk: `RULE#${rule.ruleId}`,
    createdAt: now,
    updatedAt: now,
  };

  await dynamoDb.send(
    new PutCommand({
      TableName: TABLES.CATEGORIZATION_RULES,
      Item: item,
    })
  );

  return item;
}

export async function getCategorizationRule(userId: string, ruleId: string): Promise<CategorizationRule | null> {
  const result = await dynamoDb.send(
    new GetCommand({
      TableName: TABLES.CATEGORIZATION_RULES,
      Key: {
        pk: `USER#${userId}`,
        sk: `RULE#${ruleId}`,
      },
    })
  );

  return (result.Item as CategorizationRule) || null;
}

// List all rules for a user, optionally filtered by accountId
export async function listCategorizationRules(
  userId: string, 
  accountId?: string
): Promise<CategorizationRule[]> {
  const result = await dynamoDb.send(
    new QueryCommand({
      TableName: TABLES.CATEGORIZATION_RULES,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": `USER#${userId}`,
      },
    })
  );

  let rules = (result.Items as CategorizationRule[]) || [];
  
  // Filter by accountId if provided (rules that apply to this account)
  if (accountId) {
    rules = rules.filter(rule => rule.accountIds.includes(accountId));
  }
  
  // Sort by priority
  return rules.sort((a, b) => a.priority - b.priority);
}

export async function updateCategorizationRule(
  userId: string,
  ruleId: string,
  updates: Partial<Omit<CategorizationRule, "pk" | "sk" | "ruleId" | "userId" | "createdAt">>
) {
  const updateExpressions: string[] = [];
  const expressionAttributeValues: Record<string, unknown> = {};
  const expressionAttributeNames: Record<string, string> = {};

  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined) {
      updateExpressions.push(`#${key} = :${key}`);
      expressionAttributeValues[`:${key}`] = value;
      expressionAttributeNames[`#${key}`] = key;
    }
  });

  updateExpressions.push("#updatedAt = :updatedAt");
  expressionAttributeValues[":updatedAt"] = new Date().toISOString();
  expressionAttributeNames["#updatedAt"] = "updatedAt";

  await dynamoDb.send(
    new UpdateCommand({
      TableName: TABLES.CATEGORIZATION_RULES,
      Key: {
        pk: `USER#${userId}`,
        sk: `RULE#${ruleId}`,
      },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
    })
  );
}

export async function deleteCategorizationRule(userId: string, ruleId: string) {
  await dynamoDb.send(
    new DeleteCommand({
      TableName: TABLES.CATEGORIZATION_RULES,
      Key: {
        pk: `USER#${userId}`,
        sk: `RULE#${ruleId}`,
      },
    })
  );
}

// Helper functions for Email Logs
export async function createEmailLog(log: Omit<EmailLog, "pk" | "sk" | "ttl">) {
  const date = new Date(log.processedAt).toISOString().split("T")[0]; // YYYY-MM-DD
  const timestamp = new Date(log.processedAt).getTime();
  const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60; // 90 days from now

  const item: EmailLog = {
    ...log,
    pk: `ACCOUNT#${log.accountId}#${date}`,
    sk: `EMAIL#${log.emailId}#${timestamp}`,
    ttl,
  };

  await dynamoDb.send(
    new PutCommand({
      TableName: TABLES.EMAIL_LOGS,
      Item: item,
    })
  );

  return item;
}

export async function listEmailLogs(accountId: string, date?: string): Promise<EmailLog[]> {
  const targetDate = date || new Date().toISOString().split("T")[0];

  const result = await dynamoDb.send(
    new QueryCommand({
      TableName: TABLES.EMAIL_LOGS,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": `ACCOUNT#${accountId}#${targetDate}`,
      },
    })
  );

  return (result.Items as EmailLog[]) || [];
}

export async function getRecentEmailLogs(accountId: string, days: number = 7): Promise<EmailLog[]> {
  const logs: EmailLog[] = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    const dayLogs = await listEmailLogs(accountId, dateStr);
    logs.push(...dayLogs);
  }

  return logs.sort((a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime());
}
