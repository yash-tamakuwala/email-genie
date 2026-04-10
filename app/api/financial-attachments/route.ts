import { NextRequest, NextResponse } from "next/server";
import { listFinancialAttachmentsByUser } from "@/lib/dynamodb";
import { SINGLE_USER_ID } from "@/lib/auth";

// GET - List/search financial attachments
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const documentType = searchParams.get("documentType") || undefined;
    const search = searchParams.get("search") || undefined;
    const sender = searchParams.get("sender") || undefined;
    const receiver = searchParams.get("receiver") || undefined;

    const attachments = await listFinancialAttachmentsByUser(SINGLE_USER_ID, {
      documentType,
      search,
      sender,
      receiver,
    });

    return NextResponse.json({
      success: true,
      attachments,
      count: attachments.length,
    });
  } catch (error: unknown) {
    console.error("Error listing financial attachments:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
