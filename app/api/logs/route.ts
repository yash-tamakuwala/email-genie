import { NextRequest, NextResponse } from "next/server";
import { getRecentEmailLogs, listGmailAccounts } from "@/lib/dynamodb";
import { SINGLE_USER_ID } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get("accountId");
    const days = parseInt(searchParams.get("days") || "7");

    if (!accountId) {
      // If no accountId provided, get logs for all accounts
      const accounts = await listGmailAccounts(SINGLE_USER_ID);
      const allLogs = [];
      
      for (const account of accounts) {
        const logs = await getRecentEmailLogs(account.accountId, days);
        allLogs.push(...logs);
      }
      
      // Sort by processed date (most recent first)
      allLogs.sort((a, b) => 
        new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime()
      );
      
      return NextResponse.json({ success: true, logs: allLogs, accounts });
    }

    const logs = await getRecentEmailLogs(accountId, days);
    return NextResponse.json({ success: true, logs });
  } catch (error: unknown) {
    console.error("Error fetching email logs:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch logs";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
