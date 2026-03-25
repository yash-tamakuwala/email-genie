import { NextRequest, NextResponse } from "next/server";
import { findDocuments } from "@/lib/document-finder";
import { listGmailAccounts } from "@/lib/dynamodb";
import { SINGLE_USER_ID } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { queries, query, accountIds, dateFrom, dateTo } = body;

    // Support both single `query` and multiple `queries`
    const queryList: string[] = queries
      ? (queries as string[]).filter((q: string) => q.trim())
      : query
        ? [query]
        : [];

    if (queryList.length === 0 || !dateFrom || !dateTo) {
      return NextResponse.json(
        {
          success: false,
          error: "At least one query, dateFrom, and dateTo are required",
        },
        { status: 400 }
      );
    }

    // Default to all accounts if none specified
    let targetAccountIds = accountIds as string[] | undefined;
    if (!targetAccountIds || targetAccountIds.length === 0) {
      const accounts = await listGmailAccounts(SINGLE_USER_ID);
      targetAccountIds = accounts.map((a) => a.accountId);
    }

    if (targetAccountIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "No connected Gmail accounts found" },
        { status: 400 }
      );
    }

    const summary = await findDocuments(
      queryList,
      targetAccountIds,
      dateFrom,
      dateTo
    );

    return NextResponse.json({ success: true, ...summary });
  } catch (error: unknown) {
    console.error("Document search failed:", error);
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
