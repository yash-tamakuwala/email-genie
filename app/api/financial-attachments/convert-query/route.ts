import { NextRequest, NextResponse } from "next/server";
import { convertToGmailQuery } from "@/lib/ai";

// POST - Convert natural language to Gmail search query
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { naturalLanguageQuery } = body;

    if (!naturalLanguageQuery || !naturalLanguageQuery.trim()) {
      return NextResponse.json(
        { success: false, error: "naturalLanguageQuery is required" },
        { status: 400 }
      );
    }

    const result = await convertToGmailQuery(naturalLanguageQuery.trim());

    return NextResponse.json({
      success: true,
      query: result.query,
      explanation: result.explanation,
    });
  } catch (error: unknown) {
    console.error("Error converting query:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
