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
    "https://www.googleapis.com/auth/gmail.settings.basic",
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
export interface GmailMessagePart {
  mimeType: string;
  filename?: string;
  body: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string; attachmentId?: string; size?: number };
    parts?: GmailMessagePart[];
  };
}

export interface AttachmentMetadata {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
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
    (label) => label.name?.toLowerCase() === labelName.toLowerCase()
  );
  
  if (existingLabel?.id) {
    return existingLabel.id;
  }
  
  // Create new label
  try {
    const createResponse = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name: labelName,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });
    
    return createResponse.data.id || "";
  } catch (error: any) {
    // If creation fails due to conflict, try to find the label again
    // This handles race conditions or case-sensitivity issues
    if (error.message?.includes("Label name exists") || error.message?.includes("conflicts")) {
      const retryLabelsResponse = await gmail.users.labels.list({ userId: "me" });
      const conflictingLabel = retryLabelsResponse.data.labels?.find(
        (label) => label.name?.toLowerCase() === labelName.toLowerCase()
      );
      
      if (conflictingLabel?.id) {
        return conflictingLabel.id;
      }
    }
    
    // Re-throw if it's a different error or label still not found
    throw error;
  }
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

// Newsletter blocking and unsubscribe functions

export interface UnsubscribeInfo {
  method: "http" | "mailto" | "html" | "none";
  url?: string;
  email?: string;
  oneClick?: boolean;
}

// Extract unsubscribe information from email message
export function extractUnsubscribeInfo(message: GmailMessage): UnsubscribeInfo {
  const headers = message.payload.headers;
  
  // Check for List-Unsubscribe header (RFC 2369)
  const listUnsubscribe = headers.find(
    (h) => h.name.toLowerCase() === "list-unsubscribe"
  );
  
  if (listUnsubscribe?.value) {
    const value = listUnsubscribe.value;
    
    // Check for HTTP/HTTPS URL
    const httpMatch = value.match(/<(https?:\/\/[^>]+)>/);
    if (httpMatch) {
      // Check if it's a one-click unsubscribe (RFC 8058)
      const listUnsubscribePost = headers.find(
        (h) => h.name.toLowerCase() === "list-unsubscribe-post"
      );
      const oneClick = listUnsubscribePost?.value === "List-Unsubscribe=One-Click";
      
      return {
        method: "http",
        url: httpMatch[1],
        oneClick,
      };
    }
    
    // Check for mailto
    const mailtoMatch = value.match(/<mailto:([^>]+)>/);
    if (mailtoMatch) {
      return {
        method: "mailto",
        email: mailtoMatch[1],
      };
    }
  }
  
  // Fallback: Parse HTML body for unsubscribe links
  let body = "";
  if (message.payload.body?.data) {
    body = Buffer.from(message.payload.body.data, "base64").toString("utf-8");
  } else if (message.payload.parts) {
    const htmlPart = message.payload.parts.find((part) => part.mimeType === "text/html");
    if (htmlPart?.body.data) {
      body = Buffer.from(htmlPart.body.data, "base64").toString("utf-8");
    }
  }
  
  if (body) {
    // Look for common unsubscribe link patterns
    const unsubscribeRegex = /<a[^>]*href=["']([^"']*unsubscribe[^"']*)["'][^>]*>/i;
    const match = body.match(unsubscribeRegex);
    if (match) {
      return {
        method: "html",
        url: match[1],
      };
    }
  }
  
  return { method: "none" };
}

// Process unsubscribe request
export async function processUnsubscribe(
  unsubscribeInfo: UnsubscribeInfo
): Promise<{ success: boolean; method: string; error?: string }> {
  try {
    if (unsubscribeInfo.method === "http" && unsubscribeInfo.url) {
      // For one-click unsubscribe, send POST request
      if (unsubscribeInfo.oneClick) {
        const response = await fetch(unsubscribeInfo.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "List-Unsubscribe=One-Click",
        });
        
        return {
          success: response.ok,
          method: "http-one-click",
          error: response.ok ? undefined : `HTTP ${response.status}`,
        };
      } else {
        // For regular HTTP unsubscribe, send GET request
        const response = await fetch(unsubscribeInfo.url, {
          method: "GET",
        });
        
        return {
          success: response.ok,
          method: "http-get",
          error: response.ok ? undefined : `HTTP ${response.status}`,
        };
      }
    } else if (unsubscribeInfo.method === "mailto" && unsubscribeInfo.email) {
      // For mailto, we can't automatically send email, just log it
      return {
        success: false,
        method: "mailto",
        error: "Mailto unsubscribe not supported (requires email client)",
      };
    } else if (unsubscribeInfo.method === "html" && unsubscribeInfo.url) {
      // For HTML links, send GET request
      const response = await fetch(unsubscribeInfo.url, {
        method: "GET",
      });
      
      return {
        success: response.ok,
        method: "html-link",
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    }
    
    return {
      success: false,
      method: "none",
      error: "No unsubscribe method found",
    };
  } catch (error) {
    return {
      success: false,
      method: unsubscribeInfo.method,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Create Gmail filter to block sender
export async function createGmailFilter(
  accessToken: string,
  refreshToken: string,
  senderEmail: string,
  action: "trash" | "archive" = "archive"
): Promise<string> {
  const gmail = getGmailClient(accessToken, refreshToken);
  
  const response = await gmail.users.settings.filters.create({
    userId: "me",
    requestBody: {
      criteria: {
        from: senderEmail,
      },
      action: {
        removeLabelIds: action === "trash" ? ["INBOX"] : ["INBOX"],
        addLabelIds: action === "trash" ? ["TRASH"] : [],
      },
    },
  });
  
  return response.data.id || "";
}

// Delete Gmail filter
export async function deleteGmailFilter(
  accessToken: string,
  refreshToken: string,
  filterId: string
): Promise<void> {
  const gmail = getGmailClient(accessToken, refreshToken);
  
  await gmail.users.settings.filters.delete({
    userId: "me",
    id: filterId,
  });
}

// Extract attachment metadata from message parts (recursive)
export function extractAttachmentMetadata(message: GmailMessage): AttachmentMetadata[] {
  const attachments: AttachmentMetadata[] = [];

  function traverseParts(parts?: GmailMessagePart[]) {
    if (!parts) return;
    for (const part of parts) {
      if (part.body?.attachmentId && part.filename) {
        attachments.push({
          attachmentId: part.body.attachmentId,
          fileName: part.filename,
          mimeType: part.mimeType,
          size: part.body.size || 0,
        });
      }
      if (part.parts) {
        traverseParts(part.parts);
      }
    }
  }

  traverseParts(message.payload.parts);
  return attachments;
}

// Download attachment data by ID
export async function getAttachment(
  accessToken: string,
  refreshToken: string,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const gmail = getGmailClient(accessToken, refreshToken);

  const response = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });

  const data = response.data.data || "";
  // Gmail returns URL-safe base64
  return Buffer.from(data, "base64");
}

// Search messages with a free-form Gmail query
export async function searchMessages(
  accessToken: string,
  refreshToken: string,
  query: string,
  maxResults: number = 50
): Promise<GmailMessageRef[]> {
  const gmail = getGmailClient(accessToken, refreshToken);

  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    q: query,
  });

  return (response.data.messages || []) as GmailMessageRef[];
}

// Get raw Gmail API message (not parsed) for attachment extraction
export async function getRawMessage(
  accessToken: string,
  refreshToken: string,
  messageId: string
): Promise<GmailMessage> {
  const gmail = getGmailClient(accessToken, refreshToken);

  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  return response.data as unknown as GmailMessage;
}

// List Gmail filters
export async function listGmailFilters(
  accessToken: string,
  refreshToken: string
) {
  const gmail = getGmailClient(accessToken, refreshToken);
  
  const response = await gmail.users.settings.filters.list({
    userId: "me",
  });
  
  return response.data.filter || [];
}
