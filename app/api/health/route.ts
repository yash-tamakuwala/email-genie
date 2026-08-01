import { NextResponse } from "next/server";
import { getHealthReport } from "@/lib/health";

export async function GET() {
  try {
    const health = await getHealthReport();
    return NextResponse.json({ success: true, health });
  } catch (error: unknown) {
    console.error("Error building health report:", error);
    const message = error instanceof Error ? error.message : "Failed to load health";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
