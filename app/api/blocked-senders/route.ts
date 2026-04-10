import { NextRequest, NextResponse } from "next/server";
import {
  listBlockedSenders,
  deleteBlockedSender,
  getBlockedSender,
  createBlockedSender,
  getGmailAccount,
} from "@/lib/dynamodb";
import { deleteGmailFilter, createGmailFilter, refreshAccessToken } from "@/lib/gmail";
import { verifyApiKey, SINGLE_USER_ID, isTokenExpired } from "@/lib/auth";

// GET - List all blocked senders
export async function GET(request: NextRequest) {
  try {
    // Verify API key
    const apiKey = request.headers.get("x-api-key");
    if (!verifyApiKey(apiKey)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const accountId = searchParams.get("accountId");

    // List blocked senders (optionally filtered by accountId)
    const blockedSenders = await listBlockedSenders(
      SINGLE_USER_ID,
      accountId || undefined
    );

    return NextResponse.json({
      success: true,
      blockedSenders,
      count: blockedSenders.length,
    });
  } catch (error: unknown) {
    console.error("Error listing blocked senders:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// POST - Manually block a sender
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
    const { accountId, senderEmail, senderDomain, ruleId, ruleName } = body;

    if (!accountId || !senderEmail) {
      return NextResponse.json(
        { success: false, error: "accountId and senderEmail are required" },
        { status: 400 }
      );
    }

    // Check if already blocked
    const existing = await getBlockedSender(SINGLE_USER_ID, accountId, senderEmail);
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Sender already blocked" },
        { status: 409 }
      );
    }

    // Get account credentials
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

    // Create Gmail filter
    const filterId = await createGmailFilter(
      accessToken,
      refreshToken,
      senderEmail,
      "archive"
    );

    // Store in database
    const blockedSender = await createBlockedSender({
      userId: SINGLE_USER_ID,
      accountId,
      senderEmail,
      senderDomain: senderDomain || senderEmail.split("@")[1] || "",
      blockedAt: new Date().toISOString(),
      ruleId,
      ruleName,
      unsubscribeMethod: "manual",
      gmailFilterId: filterId,
    });

    return NextResponse.json({
      success: true,
      blockedSender,
    });
  } catch (error: unknown) {
    console.error("Error blocking sender:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// DELETE - Unblock a sender
export async function DELETE(request: NextRequest) {
  try {
    // Verify API key
    const apiKey = request.headers.get("x-api-key");
    if (!verifyApiKey(apiKey)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const accountId = searchParams.get("accountId");
    const senderEmail = searchParams.get("senderEmail");

    if (!accountId || !senderEmail) {
      return NextResponse.json(
        { success: false, error: "accountId and senderEmail are required" },
        { status: 400 }
      );
    }

    // Get blocked sender record
    const blockedSender = await getBlockedSender(
      SINGLE_USER_ID,
      accountId,
      senderEmail
    );

    if (!blockedSender) {
      return NextResponse.json(
        { success: false, error: "Blocked sender not found" },
        { status: 404 }
      );
    }

    // Get account credentials
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

    // Delete Gmail filter if it exists
    if (blockedSender.gmailFilterId) {
      try {
        await deleteGmailFilter(
          accessToken,
          refreshToken,
          blockedSender.gmailFilterId
        );
      } catch (error) {
        console.error("Error deleting Gmail filter:", error);
        // Continue even if filter deletion fails (might already be deleted)
      }
    }

    // Delete from database
    await deleteBlockedSender(SINGLE_USER_ID, accountId, senderEmail);

    return NextResponse.json({
      success: true,
      message: "Sender unblocked successfully",
    });
  } catch (error: unknown) {
    console.error("Error unblocking sender:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
