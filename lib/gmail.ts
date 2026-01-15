import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

// Initialize OAuth2 Client
export function getOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// Get Authorization URL for OAuth flow
export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client();
  
  const scopes = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.labels",
    "https://www.googleapis.com/auth/userinfo.email",
  ];

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent", // Force consent screen to get refresh token
  });
}

// Exchange authorization code for tokens
export async function getTokensFromCode(code: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

// Refresh access token using refresh token
export async function refreshAccessToken(refreshToken: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  
  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials;
}

// Get Gmail API client with credentials
export function getGmailClient(accessToken: string, refreshToken: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  
  return google.gmail({ version: "v1", auth: oauth2Client });
}

// Get user email from OAuth token
export async function getUserEmail(accessToken: string): Promise<string> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();
  
  return data.email || "";
}

// Gmail API operations
export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{
      mimeType: string;
      body: { data?: string };
    }>;
  };
}

export interface ParsedEmail {
  messageId: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  snippet: string;
  labels: string[];
}

export interface GmailMessageRef {
  id: string;
  threadId?: string;
}

// Parse email message
export function parseEmail(message: GmailMessage, labelIds: string[] = []): ParsedEmail {
  const headers = message.payload.headers;
  
  const getHeader = (name: string): string => {
    const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
    return header?.value || "";
  };

  // Extract body
  let body = "";
  if (message.payload.body?.data) {
    body = Buffer.from(message.payload.body.data, "base64").toString("utf-8");
  } else if (message.payload.parts) {
    const textPart = message.payload.parts.find((part) => part.mimeType === "text/plain");
    if (textPart?.body.data) {
      body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
    }
  }

  return {
    messageId: message.id,
    threadId: message.threadId,
    from: getHeader("From"),
    to: getHeader("To"),
    subject: getHeader("Subject"),
    date: getHeader("Date"),
    body: body || message.snippet,
    snippet: message.snippet,
    labels: labelIds,
  };
}

// Get message by ID
export async function getMessage(
  accessToken: string,
  refreshToken: string,
  messageId: string
): Promise<ParsedEmail> {
  const gmail = getGmailClient(accessToken, refreshToken);
  
  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const message = response.data as unknown as GmailMessage;
  return parseEmail(message, response.data.labelIds || []);
}

// List message IDs since a timestamp (milliseconds)
export async function listMessageIdsSince(
  accessToken: string,
  refreshToken: string,
  sinceMs: number,
  maxResults: number = 25
): Promise<GmailMessageRef[]> {
  const gmail = getGmailClient(accessToken, refreshToken);
  const sinceSeconds = Math.floor(sinceMs / 1000);
  // #region agent log
  fetch('http://127.0.0.1:7246/ingest/c7dc27dc-24a4-4ecd-b380-2fe3fa6f3eb4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/gmail.ts:160',message:'Calling Gmail API messages.list',data:{sinceMs,sinceSeconds,sinceMsReadable:new Date(sinceMs).toISOString(),sinceSecondsReadable:new Date(sinceSeconds*1000).toISOString(),query:`after:${sinceSeconds}`,maxResults},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B,D'})}).catch(()=>{});
  // #endregion

  try {
    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      q: `after:${sinceSeconds}`,
    });
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/c7dc27dc-24a4-4ecd-b380-2fe3fa6f3eb4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/gmail.ts:171',message:'Gmail API response',data:{messageCount:response.data.messages?.length || 0,hasMessages:!!response.data.messages},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B,D'})}).catch(()=>{});
    // #endregion

    return (response.data.messages || []) as GmailMessageRef[];
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/c7dc27dc-24a4-4ecd-b380-2fe3fa6f3eb4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/gmail.ts:177',message:'Gmail API ERROR',data:{error:error instanceof Error ? error.message : String(error),errorDetails:error},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B,E'})}).catch(()=>{});
    // #endregion
    throw error;
  }
}

// Apply labels to message
export async function applyLabels(
  accessToken: string,
  refreshToken: string,
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[] = []
) {
  const gmail = getGmailClient(accessToken, refreshToken);
  
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds,
      removeLabelIds,
    },
  });
}

// Mark message as important (starred)
export async function markImportant(
  accessToken: string,
  refreshToken: string,
  messageId: string
) {
  await applyLabels(accessToken, refreshToken, messageId, ["STARRED"]);
}

// Mark message as read
export async function markAsRead(
  accessToken: string,
  refreshToken: string,
  messageId: string
) {
  await applyLabels(accessToken, refreshToken, messageId, [], ["UNREAD"]);
}

// Archive message (remove from inbox)
export async function archiveMessage(
  accessToken: string,
  refreshToken: string,
  messageId: string
) {
  await applyLabels(accessToken, refreshToken, messageId, [], ["INBOX"]);
}

// Mark as read and move to label (without archiving)
export async function markReadAndMoveToLabel(
  accessToken: string,
  refreshToken: string,
  messageId: string,
  labelIds: string[]
) {
  // Mark as read by removing UNREAD label
  await applyLabels(accessToken, refreshToken, messageId, labelIds, ["UNREAD"]);
}

// Get or create custom label
export async function getOrCreateLabel(
  accessToken: string,
  refreshToken: string,
  labelName: string
): Promise<string> {
  const gmail = getGmailClient(accessToken, refreshToken);
  
  // List existing labels
  const labelsResponse = await gmail.users.labels.list({ userId: "me" });
  const existingLabel = labelsResponse.data.labels?.find(
    (label) => label.name === labelName
  );
  
  if (existingLabel?.id) {
    return existingLabel.id;
  }
  
  // Create new label
  const createResponse = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });
  
  return createResponse.data.id || "";
}

// List available labels
export async function listLabels(accessToken: string, refreshToken: string) {
  const gmail = getGmailClient(accessToken, refreshToken);
  const response = await gmail.users.labels.list({ userId: "me" });
  return response.data.labels || [];
}

// Revoke OAuth token
export async function revokeToken(accessToken: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  await oauth2Client.revokeCredentials();
}
