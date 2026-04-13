import { NextRequest, NextResponse } from "next/server";
import { SINGLE_USER_ID } from "@/lib/auth";
import { getGmailAccount } from "@/lib/dynamodb";
import { searchMessages, getMessage } from "@/lib/gmail";
import { processFinancialDocument } from "@/lib/financial-document-processor";
import { refreshAccessToken } from "@/lib/gmail";
import { isTokenExpired } from "@/lib/auth";

async function getAccountTokens(accountId: string) {
  const account = await getGmailAccount(SINGLE_USER_ID, accountId);
  if (!account) throw new Error("Account not found");

  let accessToken = account.accessToken;
  const refreshToken = account.refreshToken;
  if (isTokenExpired(account.tokenExpiry)) {
    const newTokens = await refreshAccessToken(account.refreshToken);
    if (newTokens.access_token) {
      accessToken = newTokens.access_token;
    }
  }
  return { accessToken, refreshToken };
}

// GET - Search emails and return previews for user selection
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const accountId = searchParams.get("accountId");
    const query = searchParams.get("query");
    const maxResults = parseInt(searchParams.get("maxResults") || "50");

    if (!accountId || !query) {
      return NextResponse.json(
        { success: false, error: "accountId and query are required" },
        { status: 400 }
      );
    }

    const { accessToken, refreshToken } = await getAccountTokens(accountId);

    const messageRefs = await searchMessages(
      accessToken,
      refreshToken,
      query,
      Math.min(maxResults, 100)
    );

    if (messageRefs.length === 0) {
      return NextResponse.json({
        success: true,
        emails: [],
        count: 0,
      });
    }

    // Fetch email previews
    const emails = [];
    for (const ref of messageRefs) {
      if (!ref.id) continue;
      try {
        const email = await getMessage(accessToken, refreshToken, ref.id);
        emails.push({
          messageId: email.messageId,
          from: email.from,
          to: email.to,
          subject: email.subject,
          date: email.date,
          snippet: email.snippet,
          hasAttachments: email.body.includes("Content-Disposition: attachment") || false,
        });
      } catch (err) {
        console.error(`Error fetching email ${ref.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      emails,
      count: emails.length,
    });
  } catch (error: unknown) {
    console.error("Error searching emails:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// POST - Process selected emails (save attachments to S3)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, messageIds, documentType = "invoice" } = body;

    if (!accountId || !messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "accountId and messageIds array are required" },
        { status: 400 }
      );
    }

    const { accessToken, refreshToken } = await getAccountTokens(accountId);

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const results: string[] = [];

    for (const messageId of messageIds) {
      try {
        const email = await getMessage(accessToken, refreshToken, messageId);

        const actions = await processFinancialDocument({
          accessToken,
          refreshToken,
          messageId: email.messageId,
          accountId,
          userId: SINGLE_USER_ID,
          emailFrom: email.from,
          emailSubject: email.subject,
          emailDate: email.date || new Date().toISOString(),
          emailBody: email.body,
          emailSnippet: email.snippet,
          financialDocumentType: documentType,
          description: `${email.subject} from ${email.from}`,
        });

        const savedCount = actions.filter((a) => a.startsWith("financial_doc_saved:")).length;
        const alreadySaved = actions.filter((a) => a.startsWith("financial_doc_already_saved:")).length;

        if (savedCount > 0) {
          processed++;
          results.push(`Saved: ${email.subject}`);
        } else if (alreadySaved > 0) {
          skipped++;
          results.push(`Already saved: ${email.subject}`);
        } else {
          skipped++;
          results.push(`No attachments: ${email.subject}`);
        }
      } catch (err) {
        errors++;
        console.error(`Error processing email ${messageId}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Saved ${processed} documents from ${messageIds.length} emails`,
      processed,
      skipped,
      errors,
      results,
    });
  } catch (error: unknown) {
    console.error("Error processing selected emails:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
