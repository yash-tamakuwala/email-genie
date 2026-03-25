import JSZip from "jszip";
import { buildGmailSearchQuery, rankDocumentRelevance } from "@/lib/ai";
import { getGmailAccount, GmailAccount } from "@/lib/dynamodb";
import { ensureValidTokens } from "@/lib/email-poller";
import {
  AttachmentInfo,
  downloadAttachment,
  getMessageWithAttachmentInfo,
  searchMessages,
} from "@/lib/gmail";
import { SINGLE_USER_ID } from "@/lib/auth";

export interface DocumentSearchResult {
  accountId: string;
  accountEmail: string;
  messageId: string;
  subject: string;
  sender: string;
  date: string;
  snippet: string;
  attachments: AttachmentInfo[];
  confidence: number;
  reasoning: string;
  matchedQuery: string;
  passwordHint: string | null;
}

export interface QueryDetail {
  query: string;
  gmailQuery: string;
  resultCount: number;
}

export interface DocumentSearchSummary {
  queries: string[];
  queryDetails: QueryDetail[];
  results: DocumentSearchResult[];
  totalEmailsScanned: number;
}

const BATCH_SIZE = 5; // Messages to fetch in parallel
const RANK_BATCH_SIZE = 20; // Emails to rank per AI call

// Search connected Gmail accounts for documents matching multiple queries
export async function findDocuments(
  queries: string[],
  accountIds: string[],
  dateFrom: string,
  dateTo: string
): Promise<DocumentSearchSummary> {
  const allResults: DocumentSearchResult[] = [];
  const queryDetails: QueryDetail[] = [];
  let totalEmailsScanned = 0;
  const seenMessageIds = new Set<string>();

  // Process each query independently
  for (const query of queries) {
    const { gmailQuery } = await buildGmailSearchQuery(query, dateFrom, dateTo);

    let queryResultCount = 0;

    for (const accountId of accountIds) {
      const account = await getGmailAccount(SINGLE_USER_ID, accountId);
      if (!account) continue;

      try {
        const accountResults = await searchAccountForDocuments(
          account,
          gmailQuery,
          query
        );
        totalEmailsScanned += accountResults.scanned;

        // Deduplicate across queries by messageId
        for (const result of accountResults.results) {
          const key = `${result.accountId}:${result.messageId}`;
          if (!seenMessageIds.has(key)) {
            seenMessageIds.add(key);
            allResults.push({ ...result, matchedQuery: query });
            queryResultCount++;
          }
        }
      } catch (error) {
        console.error(
          `Error searching account ${accountId} for "${query}":`,
          error
        );
      }
    }

    queryDetails.push({
      query,
      gmailQuery,
      resultCount: queryResultCount,
    });
  }

  // Sort by confidence descending
  allResults.sort((a, b) => b.confidence - a.confidence);

  return {
    queries,
    queryDetails,
    results: allResults,
    totalEmailsScanned,
  };
}

async function searchAccountForDocuments(
  account: GmailAccount,
  gmailQuery: string,
  originalQuery: string
): Promise<{ results: DocumentSearchResult[]; scanned: number }> {
  const { accessToken, refreshToken } = await ensureValidTokens(account);

  // Search Gmail
  const messageRefs = await searchMessages(accessToken, refreshToken, {
    query: gmailQuery,
    maxResults: 50,
  });

  if (messageRefs.length === 0) {
    return { results: [], scanned: 0 };
  }

  // Fetch message details with attachment info in batches
  const emailsWithAttachments: Array<{
    messageId: string;
    subject: string;
    sender: string;
    date: string;
    snippet: string;
    body: string;
    attachments: AttachmentInfo[];
  }> = [];

  for (let i = 0; i < messageRefs.length; i += BATCH_SIZE) {
    const batch = messageRefs.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (ref) => {
        try {
          return await getMessageWithAttachmentInfo(
            accessToken,
            refreshToken,
            ref.id
          );
        } catch {
          return null;
        }
      })
    );

    for (const msg of results) {
      if (msg && msg.attachments.length > 0) {
        emailsWithAttachments.push({
          messageId: msg.messageId,
          subject: msg.subject,
          sender: msg.from,
          date: msg.date,
          snippet: msg.snippet,
          body: msg.body,
          attachments: msg.attachments,
        });
      }
    }
  }

  if (emailsWithAttachments.length === 0) {
    return { results: [], scanned: messageRefs.length };
  }

  // Rank relevance with AI in batches
  const rankedResults: DocumentSearchResult[] = [];

  for (let i = 0; i < emailsWithAttachments.length; i += RANK_BATCH_SIZE) {
    const batch = emailsWithAttachments.slice(i, i + RANK_BATCH_SIZE);
    const emailsForRanking = batch.map((e, idx) => ({
      index: i + idx,
      subject: e.subject,
      sender: e.sender,
      snippet: e.snippet,
      body: e.body,
      attachmentFilenames: e.attachments.map((a) => a.filename),
    }));

    const { rankings } = await rankDocumentRelevance(
      emailsForRanking,
      originalQuery
    );

    for (const rank of rankings) {
      if (!rank.relevant) continue;
      const email = emailsWithAttachments[rank.index];
      if (!email) continue;

      rankedResults.push({
        accountId: account.accountId,
        accountEmail: account.email,
        messageId: email.messageId,
        subject: email.subject,
        sender: email.sender,
        date: email.date,
        snippet: email.snippet,
        attachments: email.attachments,
        confidence: rank.confidence,
        reasoning: rank.reasoning,
        matchedQuery: originalQuery,
        passwordHint: rank.passwordHint ?? null,
      });
    }
  }

  return { results: rankedResults, scanned: messageRefs.length };
}

// Download selected attachments and bundle into a zip
export async function downloadAttachmentsAsZip(
  items: Array<{
    accountId: string;
    messageId: string;
    attachmentId: string;
    filename: string;
  }>
): Promise<Buffer> {
  const zip = new JSZip();
  const usedFilenames = new Set<string>();

  for (const item of items) {
    const account = await getGmailAccount(SINGLE_USER_ID, item.accountId);
    if (!account) continue;

    const { accessToken, refreshToken } = await ensureValidTokens(account);

    try {
      const buffer = await downloadAttachment(
        accessToken,
        refreshToken,
        item.messageId,
        item.attachmentId
      );

      // Deduplicate filenames
      let filename = item.filename;
      let counter = 1;
      while (usedFilenames.has(filename)) {
        const ext = filename.lastIndexOf(".");
        if (ext > 0) {
          filename = `${item.filename.slice(0, ext)} (${counter})${item.filename.slice(ext)}`;
        } else {
          filename = `${item.filename} (${counter})`;
        }
        counter++;
      }
      usedFilenames.add(filename);

      zip.file(filename, buffer);
    } catch (error) {
      console.error(
        `Failed to download attachment ${item.attachmentId} from message ${item.messageId}:`,
        error
      );
    }
  }

  return zip.generateAsync({ type: "nodebuffer" }) as Promise<Buffer>;
}

// Download a single attachment
export async function downloadSingleAttachment(
  accountId: string,
  messageId: string,
  attachmentId: string
): Promise<{ buffer: Buffer; filename: string; mimeType: string } | null> {
  const account = await getGmailAccount(SINGLE_USER_ID, accountId);
  if (!account) return null;

  const { accessToken, refreshToken } = await ensureValidTokens(account);

  // Get message to find the attachment's filename and mimeType
  const msg = await getMessageWithAttachmentInfo(
    accessToken,
    refreshToken,
    messageId
  );
  const attachment = msg.attachments.find(
    (a) => a.attachmentId === attachmentId
  );
  if (!attachment) return null;

  const buffer = await downloadAttachment(
    accessToken,
    refreshToken,
    messageId,
    attachmentId
  );

  return {
    buffer,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
  };
}
