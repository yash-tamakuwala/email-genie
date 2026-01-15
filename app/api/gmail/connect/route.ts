import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/gmail";
import { generateOAuthState } from "@/lib/auth";

export async function GET() {
  try {
    // Generate OAuth state for CSRF protection
    const state = generateOAuthState();
    
    // Get authorization URL
    const authUrl = getAuthUrl();
    const urlWithState = `${authUrl}&state=${state}`;
    
    // Store state in cookie for verification
    const response = NextResponse.json({
      success: true,
      authUrl: urlWithState,
    });
    
    response.cookies.set("oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
    });
    
    return response;
  } catch (error: unknown) {
    console.error("Error generating auth URL:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
