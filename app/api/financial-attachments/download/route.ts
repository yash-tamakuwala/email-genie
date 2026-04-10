import { NextRequest, NextResponse } from "next/server";
import { listFinancialAttachmentsByUser } from "@/lib/dynamodb";
import { getPresignedDownloadUrl } from "@/lib/s3";
import { SINGLE_USER_ID } from "@/lib/auth";

// GET - Generate a presigned download URL for an attachment
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const attachmentId = searchParams.get("attachmentId");

    if (!attachmentId) {
      return NextResponse.json(
        { success: false, error: "attachmentId is required" },
        { status: 400 }
      );
    }

    // Find the attachment by scanning user's attachments
    const attachments = await listFinancialAttachmentsByUser(SINGLE_USER_ID);
    const attachment = attachments.find((a) => a.attachmentId === attachmentId);

    if (!attachment) {
      return NextResponse.json(
        { success: false, error: "Attachment not found" },
        { status: 404 }
      );
    }

    const downloadUrl = await getPresignedDownloadUrl(attachment.s3Key);

    return NextResponse.json({
      success: true,
      downloadUrl,
      fileName: attachment.fileName,
    });
  } catch (error: unknown) {
    console.error("Error generating download URL:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
