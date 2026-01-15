import { NextRequest, NextResponse } from "next/server";
import { listGmailAccounts, deleteGmailAccount } from "@/lib/dynamodb";
import { revokeToken } from "@/lib/gmail";
import { SINGLE_USER_ID } from "@/lib/auth";

// GET - List all connected Gmail accounts
export async function GET() {
  try {
    const accounts = await listGmailAccounts(SINGLE_USER_ID);
    
    // Remove sensitive tokens from response
    const sanitizedAccounts = accounts.map((account) => ({
      accountId: account.accountId,
      email: account.email,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }));
    
    return NextResponse.json({
      success: true,
      accounts: sanitizedAccounts,
    });
  } catch (error: unknown) {
    console.error("Error listing accounts:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// DELETE - Remove a Gmail account
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    
    if (!accountId) {
      return NextResponse.json(
        { success: false, error: "Missing accountId parameter" },
        { status: 400 }
      );
    }
    
    // Get account to retrieve access token
    const { getGmailAccount } = await import("@/lib/dynamodb");
    const account = await getGmailAccount(SINGLE_USER_ID, accountId);
    
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      );
    }
    
    // Revoke OAuth token
    try {
      await revokeToken(account.accessToken);
    } catch (error) {
      console.error("Error revoking token:", error);
      // Continue with deletion even if revocation fails
    }
    
    // Delete account from database
    await deleteGmailAccount(SINGLE_USER_ID, accountId);
    
    return NextResponse.json({
      success: true,
      message: "Account disconnected successfully",
    });
  } catch (error: unknown) {
    console.error("Error deleting account:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
