import { categorizeEmail } from "@/lib/ai";
import {
  createEmailLog,
  listCategorizationRules,
  listGmailAccounts,
  setJobStatus,
} from "@/lib/dynamodb";
import { pollAccountForEmails } from "@/lib/email-poller";
import { generateEmailId, SINGLE_USER_ID } from "@/lib/auth";
import { applyLabels, archiveMessage, getOrCreateLabel, markImportant, markReadAndMoveToLabel } from "@/lib/gmail";

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
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/c7dc27dc-24a4-4ecd-b380-2fe3fa6f3eb4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/background-jobs.ts:45',message:'Polling completed',data:{accountId:account.accountId,emailCount:emails.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C,D'})}).catch(()=>{});
        // #endregion

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

            if (categorization.shouldMarkImportant) {
              await markImportant(accessToken, refreshToken, email.messageId);
              appliedActions.push("marked_important");
            }

            if (categorization.shouldSkipInbox) {
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
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/c7dc27dc-24a4-4ecd-b380-2fe3fa6f3eb4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/background-jobs.ts:115',message:'ERROR polling account',data:{accountId:account.accountId,email:account.email,error:error instanceof Error ? error.message : String(error),errorStack:error instanceof Error ? error.stack : undefined},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B,E'})}).catch(()=>{});
        // #endregion
        console.error(`Error polling account ${account.accountId}:`, error);
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
