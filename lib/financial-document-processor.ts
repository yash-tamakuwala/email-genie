import { nanoid } from "nanoid";
import {
  getRawMessage,
  extractAttachmentMetadata,
  getAttachment,
} from "@/lib/gmail";
import { uploadAttachment } from "@/lib/s3";
import {
  createFinancialAttachment,
  findFinancialAttachmentByMessageAndFile,
} from "@/lib/dynamodb";

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 100);
}

export interface ProcessFinancialDocumentParams {
  accessToken: string;
  refreshToken: string;
  messageId: string;
  accountId: string;
  userId: string;
  emailFrom: string;
  emailSubject: string;
  emailDate: string;
  emailBody: string;
  emailSnippet: string;
  financialDocumentType: string;
  description: string;
}

export async function processFinancialDocument(
  params: ProcessFinancialDocumentParams
): Promise<string[]> {
  const appliedActions: string[] = [];

  // Get full message to extract attachment parts
  const rawMessage = await getRawMessage(
    params.accessToken,
    params.refreshToken,
    params.messageId
  );

  // Extract "To" header from raw message
  const toHeader = rawMessage.payload.headers.find(
    (h) => h.name.toLowerCase() === "to"
  );
  const emailTo = toHeader?.value || "";

  const attachmentMetas = extractAttachmentMetadata(rawMessage);

  if (attachmentMetas.length === 0) {
    return appliedActions;
  }

  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");

  for (const meta of attachmentMetas) {
    try {
      // Check if already processed
      const existing = await findFinancialAttachmentByMessageAndFile(
        params.accountId,
        params.messageId,
        meta.fileName
      );
      if (existing) {
        appliedActions.push(`financial_doc_already_saved:${meta.fileName}`);
        continue;
      }

      // Download attachment
      const data = await getAttachment(
        params.accessToken,
        params.refreshToken,
        params.messageId,
        meta.attachmentId
      );

      const attachmentId = nanoid(16);
      const sanitizedName = sanitizeFileName(meta.fileName);
      const s3Key = `${params.userId}/${params.accountId}/${year}/${month}/${params.financialDocumentType}/${attachmentId}-${sanitizedName}`;

      // Upload to S3
      await uploadAttachment(s3Key, data, meta.mimeType);

      // Save metadata to DynamoDB
      await createFinancialAttachment({
        attachmentId,
        accountId: params.accountId,
        userId: params.userId,
        emailMessageId: params.messageId,
        emailSubject: params.emailSubject,
        emailFrom: params.emailFrom,
        emailTo,
        emailDate: params.emailDate,
        emailBody: params.emailBody,
        emailSnippet: params.emailSnippet,
        fileName: meta.fileName,
        fileSize: data.length,
        mimeType: meta.mimeType,
        s3Key,
        financialDocumentType: params.financialDocumentType,
        description: params.description,
        uploadedAt: now.toISOString(),
      });

      appliedActions.push(
        `financial_doc_saved:${params.financialDocumentType}:${meta.fileName}`
      );
    } catch (attachmentError) {
      console.error(
        `Error processing attachment ${meta.fileName} from email ${params.messageId}:`,
        attachmentError
      );
      appliedActions.push(
        `financial_doc_error:${meta.fileName}:${attachmentError instanceof Error ? attachmentError.message : "unknown"}`
      );
    }
  }

  return appliedActions;
}
