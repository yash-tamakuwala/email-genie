import { NextRequest, NextResponse } from "next/server";
import { listCategorizationRules, getGmailAccount } from "@/lib/dynamodb";
import { categorizeEmail } from "@/lib/ai";
import { SINGLE_USER_ID } from "@/lib/auth";

// POST - Test categorization without applying actions to Gmail
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, from, subject, body: emailBody, snippet } = body;

    if (!accountId || !from || !subject) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const account = await getGmailAccount(SINGLE_USER_ID, accountId);
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      );
    }

    const rules = await listCategorizationRules(SINGLE_USER_ID, accountId);
    const emailContent = emailBody || snippet || "";

    const categorization = await categorizeEmail(
      {
        from,
        subject,
        body: emailContent,
        snippet: snippet || emailContent,
      },
      rules
    );

    return NextResponse.json({
      success: true,
      categorization,
    });
  } catch (error: unknown) {
    console.error("Error testing categorization:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
