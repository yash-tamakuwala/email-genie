import { NextRequest, NextResponse } from "next/server";
import { SINGLE_USER_ID } from "@/lib/auth";
import { getGmailAccount, listCategorizationRules } from "@/lib/dynamodb";
import { searchMessages, getMessage } from "@/lib/gmail";
import { categorizeEmail } from "@/lib/ai";
import { processFinancialDocument } from "@/lib/financial-document-processor";
import { refreshAccessToken } from "@/lib/gmail";
import { isTokenExpired } from "@/lib/auth";

// POST - Search older emails and process financial documents
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, query, maxResults = 50 } = body;

    if (!accountId || !query) {
      return NextResponse.json(
        { success: false, error: "accountId and query are required" },
        { status: 400 }
      );
    }

    // Get account
    const account = await getGmailAccount(SINGLE_USER_ID, accountId);
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      );
    }

    // Refresh token if needed
    let accessToken = account.accessToken;
    const refreshToken = account.refreshToken;
    if (isTokenExpired(account.tokenExpiry)) {
      const newTokens = await refreshAccessToken(account.refreshToken);
      if (newTokens.access_token) {
        accessToken = newTokens.access_token;
      }
    }

    // Search for messages
    const messageRefs = await searchMessages(
      accessToken,
      refreshToken,
      query,
      Math.min(maxResults, 100)
    );

    if (messageRefs.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No emails found matching the query",
        found: 0,
        processed: 0,
        skipped: 0,
        errors: 0,
      });
    }

    const rules = await listCategorizationRules(SINGLE_USER_ID, accountId);

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const results: string[] = [];

    for (const ref of messageRefs) {
      if (!ref.id) continue;

      try {
        // Get full email
        const email = await getMessage(accessToken, refreshToken, ref.id);

        // Categorize with AI
        const categorization = await categorizeEmail(
          {
            from: email.from,
            subject: email.subject,
            body: email.body,
            snippet: email.snippet,
          },
          rules
        );

        if (categorization.isFinancialDocument && categorization.financialDocumentType !== "none") {
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
            financialDocumentType: categorization.financialDocumentType,
            description: categorization.financialDocumentDescription,
          });

          const savedCount = actions.filter((a) => a.startsWith("financial_doc_saved:")).length;
          const skippedCount = actions.filter((a) => a.startsWith("financial_doc_already_saved:")).length;

          if (savedCount > 0) {
            processed++;
            results.push(`Saved: ${email.subject}`);
          } else if (skippedCount > 0) {
            skipped++;
          }
        } else {
          skipped++;
        }
      } catch (err) {
        errors++;
        console.error(`Error processing historical email ${ref.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${processed} financial documents from ${messageRefs.length} emails`,
      found: messageRefs.length,
      processed,
      skipped,
      errors,
      results,
    });
  } catch (error: unknown) {
    console.error("Error processing historical emails:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
