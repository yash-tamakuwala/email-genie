import { NextRequest, NextResponse } from "next/server";
import {
  getGmailAccount,
  listCategorizationRules,
  createEmailLog,
  createBlockedSender,
  getBlockedSender,
} from "@/lib/dynamodb";
import {
  refreshAccessToken,
  markImportant,
  archiveMessage,
  getOrCreateLabel,
  applyLabels,
  getMessage,
  extractUnsubscribeInfo,
  processUnsubscribe,
  createGmailFilter,
} from "@/lib/gmail";
import { categorizeEmail } from "@/lib/ai";
import {
  verifyApiKey,
  generateEmailId,
  isTokenExpired,
  SINGLE_USER_ID,
} from "@/lib/auth";

// POST - Categorize an email (internal/testing endpoint)
export async function POST(request: NextRequest) {
  try {
    // Verify API key
    const apiKey = request.headers.get("x-api-key");
    if (!verifyApiKey(apiKey)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      accountId,
      messageId,
      from,
      subject,
      body: emailBody,
      snippet,
    } = body;

    // Validation
    if (!accountId || !messageId || !from || !subject) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
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

    // Check if token needs refresh
    let accessToken = account.accessToken;
    const refreshToken = account.refreshToken;

    if (isTokenExpired(account.tokenExpiry)) {
      const newTokens = await refreshAccessToken(account.refreshToken);
      
      if (newTokens.access_token) {
        accessToken = newTokens.access_token;
        
        // Update tokens in database
        const { updateGmailAccountTokens } = await import("@/lib/dynamodb");
        await updateGmailAccountTokens(
          SINGLE_USER_ID,
          accountId,
          newTokens.access_token,
          newTokens.refresh_token || account.refreshToken,
          newTokens.expiry_date || Date.now() + 3600 * 1000
        );
      }
    }

    // Get categorization rules for this account (global rules filtered by accountId)
    const rules = await listCategorizationRules(SINGLE_USER_ID, accountId);

    // Categorize email using AI
    const categorization = await categorizeEmail(
      {
        from,
        subject,
        body: emailBody || snippet,
        snippet,
      },
      rules
    );

    // Apply actions based on categorization
    const appliedActions: string[] = [];

    try {
      // Handle block and unsubscribe action
      if (categorization.shouldBlockAndUnsubscribe) {
        try {
          // Extract sender email
          const senderEmailMatch = from.match(/<(.+?)>/);
          const senderEmail = senderEmailMatch ? senderEmailMatch[1] : from;
          const senderDomain = senderEmail.split("@")[1] || "";

          // Check if already blocked
          const existingBlock = await getBlockedSender(
            SINGLE_USER_ID,
            accountId,
            senderEmail
          );

          if (!existingBlock) {
            // Get full message to extract unsubscribe info
            const fullMessage = await getMessage(accessToken, refreshToken, messageId);
            const unsubscribeInfo = extractUnsubscribeInfo(fullMessage as any);

            // Attempt to unsubscribe
            const unsubscribeResult = await processUnsubscribe(unsubscribeInfo);
            
            // Create Gmail filter to block future emails
            const filterId = await createGmailFilter(
              accessToken,
              refreshToken,
              senderEmail,
              "archive"
            );

            // Find the rule that triggered this action
            const matchedRule = rules.find(r => 
              r.actions.blockAndUnsubscribe && r.enabled
            );

            // Store in blocked senders list
            await createBlockedSender({
              userId: SINGLE_USER_ID,
              accountId,
              senderEmail,
              senderDomain,
              blockedAt: new Date().toISOString(),
              ruleId: matchedRule?.ruleId,
              ruleName: matchedRule?.name,
              unsubscribeMethod: unsubscribeResult.success 
                ? unsubscribeResult.method 
                : `failed:${unsubscribeResult.method}`,
              gmailFilterId: filterId,
            });

            appliedActions.push(
              `blocked_sender:${senderEmail}`,
              `unsubscribe:${unsubscribeResult.success ? "success" : "failed"}`,
              `filter_created:${filterId}`
            );
          } else {
            appliedActions.push(`already_blocked:${senderEmail}`);
          }

          // Archive the current email
          await archiveMessage(accessToken, refreshToken, messageId);
          appliedActions.push("archived");
        } catch (blockError) {
          console.error(
            `Error blocking sender for email ${messageId}:`,
            blockError
          );
          appliedActions.push(`block_error:${blockError instanceof Error ? blockError.message : "unknown"}`);
        }
      }

      // Mark as important
      if (categorization.shouldMarkImportant) {
        await markImportant(accessToken, refreshToken, messageId);
        appliedActions.push("marked_important");
      }

      // Archive (skip inbox) - only if not already archived by block action
      if (categorization.shouldSkipInbox && !categorization.shouldBlockAndUnsubscribe) {
        await archiveMessage(accessToken, refreshToken, messageId);
        appliedActions.push("archived");
      }

      // Apply custom labels
      if (categorization.suggestedLabels.length > 0) {
        const labelIds: string[] = [];
        for (const labelName of categorization.suggestedLabels) {
          const labelId = await getOrCreateLabel(
            accessToken,
            refreshToken,
            labelName
          );
          labelIds.push(labelId);
        }
        
        if (labelIds.length > 0) {
          await applyLabels(accessToken, refreshToken, messageId, labelIds);
          appliedActions.push(`applied_labels:${categorization.suggestedLabels.join(",")}`);
        }
      }

      // Note: Pin conversation is not directly supported by Gmail API
      // It would require additional implementation or workaround
    } catch (error) {
      console.error("Error applying actions:", error);
      appliedActions.push("error_applying_actions");
    }

    // Log the categorization
    const emailId = generateEmailId();
    await createEmailLog({
      accountId,
      messageId,
      emailId,
      sender: from,
      subject,
      appliedActions,
      ruleMatched: categorization.reasoning,
      categorization: JSON.stringify(categorization),
      processedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      categorization,
      appliedActions,
      confidence: categorization.confidence,
    });
  } catch (error: unknown) {
    console.error("Error categorizing email:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// GET - Test endpoint to check if API is working
export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Email categorization API is running",
    timestamp: new Date().toISOString(),
  });
}
