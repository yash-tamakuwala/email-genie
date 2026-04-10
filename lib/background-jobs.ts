import { categorizeEmail } from "@/lib/ai";
import {
  createEmailLog,
  listCategorizationRules,
  listGmailAccounts,
  setJobStatus,
  createBlockedSender,
  getBlockedSender,
  markAccountSyncErrorNotified,
  clearAccountSyncError,
} from "@/lib/dynamodb";
import { sendSyncErrorNotification } from "@/lib/email-notifier";
import { pollAccountForEmails } from "@/lib/email-poller";
import { generateEmailId, SINGLE_USER_ID } from "@/lib/auth";
import { processFinancialDocument } from "@/lib/financial-document-processor";
import {
  applyLabels,
  archiveMessage, 
  getOrCreateLabel, 
  markImportant, 
  markReadAndMoveToLabel,
  getMessage,
  extractUnsubscribeInfo,
  processUnsubscribe,
  createGmailFilter,
} from "@/lib/gmail";

export interface JobRunSummary {
  startedAt: string;
  finishedAt: string;
  status: "success" | "partial" | "error";
  processedCount: number;
  errorCount: number;
  message?: string;
}

export async function runEmailProcessingJob(): Promise<JobRunSummary> {
  const startedAt = new Date().toISOString();

  await setJobStatus({
    lastRunAt: startedAt,
    status: "running",
    processedCount: 0,
    errorCount: 0,
    message: "Job started",
  });

  let processedCount = 0;
  let errorCount = 0;

  try {
    const accounts = await listGmailAccounts(SINGLE_USER_ID);

    for (const account of accounts) {
      try {
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/c7dc27dc-24a4-4ecd-b380-2fe3fa6f3eb4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/background-jobs.ts:40',message:'Processing account',data:{accountId:account.accountId,email:account.email},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B,C'})}).catch(()=>{});
        // #endregion
        const { emails, accessToken, refreshToken } = await pollAccountForEmails(account);

        // Clear sync error flag on successful poll
        if (account.syncErrorNotifiedAt) {
          await clearAccountSyncError(SINGLE_USER_ID, account.accountId);
        }

        if (!emails.length) {
          continue;
        }

        const rules = await listCategorizationRules(SINGLE_USER_ID, account.accountId);

        for (const email of emails) {
          try {
            const categorization = await categorizeEmail(
              {
                from: email.from,
                subject: email.subject,
                body: email.body,
                snippet: email.snippet,
              },
              rules
            );

            const appliedActions: string[] = [];

            // Financial document auto-save (always-on, independent of rules)
            if (categorization.isFinancialDocument && categorization.financialDocumentType !== "none") {
              try {
                const financialActions = await processFinancialDocument({
                  accessToken,
                  refreshToken,
                  messageId: email.messageId,
                  accountId: account.accountId,
                  userId: SINGLE_USER_ID,
                  emailFrom: email.from,
                  emailSubject: email.subject,
                  emailDate: new Date().toISOString(),
                  emailBody: email.body,
                  emailSnippet: email.snippet,
                  financialDocumentType: categorization.financialDocumentType,
                  description: categorization.financialDocumentDescription,
                });
                appliedActions.push(...financialActions);
              } catch (financialError) {
                console.error(
                  `Error processing financial document for email ${email.messageId}:`,
                  financialError
                );
                appliedActions.push(
                  `financial_doc_error:${financialError instanceof Error ? financialError.message : "unknown"}`
                );
              }
            }

            // Handle block and unsubscribe action
            if (categorization.shouldBlockAndUnsubscribe) {
              try {
                // Extract sender email
                const senderEmailMatch = email.from.match(/<(.+?)>/);
                const senderEmail = senderEmailMatch ? senderEmailMatch[1] : email.from;
                const senderDomain = senderEmail.split("@")[1] || "";

                // Check if already blocked
                const existingBlock = await getBlockedSender(
                  SINGLE_USER_ID,
                  account.accountId,
                  senderEmail
                );

                if (!existingBlock) {
                  // Get full message to extract unsubscribe info
                  const fullMessage = await getMessage(accessToken, refreshToken, email.messageId);
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
                    accountId: account.accountId,
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
                await archiveMessage(accessToken, refreshToken, email.messageId);
                appliedActions.push("archived");
              } catch (blockError) {
                console.error(
                  `Error blocking sender for email ${email.messageId}:`,
                  blockError
                );
                appliedActions.push(`block_error:${blockError instanceof Error ? blockError.message : "unknown"}`);
              }
            }

            if (categorization.shouldMarkImportant) {
              await markImportant(accessToken, refreshToken, email.messageId);
              appliedActions.push("marked_important");
            }

            if (categorization.shouldSkipInbox && !categorization.shouldBlockAndUnsubscribe) {
              await archiveMessage(accessToken, refreshToken, email.messageId);
              appliedActions.push("archived");
            }

            if (categorization.shouldMarkReadAndLabel && categorization.suggestedLabels.length > 0) {
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
                await markReadAndMoveToLabel(accessToken, refreshToken, email.messageId, labelIds);
                appliedActions.push(`marked_read_and_labeled:${categorization.suggestedLabels.join(",")}`);
              }
            } else if (categorization.suggestedLabels.length > 0) {
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
                await applyLabels(accessToken, refreshToken, email.messageId, labelIds);
                appliedActions.push(`applied_labels:${categorization.suggestedLabels.join(",")}`);
              }
            }

            const emailId = generateEmailId();
            await createEmailLog({
              accountId: account.accountId,
              messageId: email.messageId,
              emailId,
              sender: email.from,
              subject: email.subject,
              body: email.body,
              snippet: email.snippet,
              appliedActions,
              ruleMatched: categorization.reasoning,
              categorization: JSON.stringify(categorization),
              processedAt: new Date().toISOString(),
            });

            processedCount += 1;
          } catch (error) {
            errorCount += 1;
            console.error(
              `Error processing email ${email.messageId} for account ${account.accountId}:`,
              error
            );
          }
        }
      } catch (error) {
        errorCount += 1;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error polling account ${account.accountId} (${account.email}): ${errorMessage}`);

        // Send notification once — skip if already notified
        if (!account.syncErrorNotifiedAt) {
          try {
            await sendSyncErrorNotification(account.email, account.accountId, errorMessage);
            await markAccountSyncErrorNotified(SINGLE_USER_ID, account.accountId);
          } catch (notifyError) {
            console.error("Failed to send sync error notification:", notifyError);
          }
        }
      }
    }

    const finishedAt = new Date().toISOString();
    const status = errorCount > 0 ? "partial" : "success";

    await setJobStatus({
      lastRunAt: finishedAt,
      status,
      processedCount,
      errorCount,
      message: `Processed ${processedCount} emails with ${errorCount} errors`,
    });

    return {
      startedAt,
      finishedAt,
      status,
      processedCount,
      errorCount,
      message: `Processed ${processedCount} emails with ${errorCount} errors`,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    await setJobStatus({
      lastRunAt: finishedAt,
      status: "error",
      processedCount,
      errorCount: errorCount + 1,
      message: "Job failed with an unexpected error",
    });

    throw error;
  }
}
