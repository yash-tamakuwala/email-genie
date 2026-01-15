import { NextResponse } from "next/server";
import { getJobStatus } from "@/lib/dynamodb";

export async function GET() {
  try {
    const status = await getJobStatus();
    return NextResponse.json({ success: true, status });
  } catch (error: unknown) {
    console.error("Error fetching job status:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch job status";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
