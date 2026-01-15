import { NextRequest, NextResponse } from "next/server";
import { runEmailProcessingJob } from "@/lib/background-jobs";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return true;
  }

  // Check for Vercel's cron authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) {
    return true;
  }

  // Also support custom header and URL param for manual testing
  const headerSecret = request.headers.get("x-cron-secret");
  const urlSecret = request.nextUrl.searchParams.get("secret");
  return headerSecret === secret || urlSecret === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runEmailProcessingJob();
    return NextResponse.json({ success: true, summary });
  } catch (error: unknown) {
    console.error("Email processing job failed:", error);
    const message = error instanceof Error ? error.message : "Job failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
