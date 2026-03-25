import { NextRequest, NextResponse } from "next/server";
import {
  downloadAttachmentsAsZip,
  downloadSingleAttachment,
} from "@/lib/document-finder";

// GET: Download a single attachment
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const accountId = searchParams.get("accountId");
    const messageId = searchParams.get("messageId");
    const attachmentId = searchParams.get("attachmentId");

    if (!accountId || !messageId || !attachmentId) {
      return NextResponse.json(
        {
          success: false,
          error: "accountId, messageId, and attachmentId are required",
        },
        { status: 400 }
      );
    }

    const result = await downloadSingleAttachment(
      accountId,
      messageId,
      attachmentId
    );

    if (!result) {
      return NextResponse.json(
        { success: false, error: "Attachment not found" },
        { status: 404 }
      );
    }

    return new Response(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(result.filename)}"`,
        "Content-Length": String(result.buffer.length),
      },
    });
  } catch (error: unknown) {
    console.error("Single attachment download failed:", error);
    const message =
      error instanceof Error ? error.message : "Download failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// POST: Download multiple attachments as a zip
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "items array is required with { accountId, messageId, attachmentId, filename }",
        },
        { status: 400 }
      );
    }

    const zipBuffer = await downloadAttachmentsAsZip(items);

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="documents.zip"`,
        "Content-Length": String(zipBuffer.length),
      },
    });
  } catch (error: unknown) {
    console.error("Zip download failed:", error);
    const message =
      error instanceof Error ? error.message : "Download failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
