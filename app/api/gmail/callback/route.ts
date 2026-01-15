import { NextRequest, NextResponse } from "next/server";
import { getTokensFromCode, getUserEmail } from "@/lib/gmail";
import { createGmailAccount } from "@/lib/dynamodb";
import { generateAccountId, verifyOAuthState, SINGLE_USER_ID } from "@/lib/auth";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    
    // Check for OAuth errors
    if (error) {
      return NextResponse.redirect(
        new URL(`/accounts/connect?error=${error}`, request.url)
      );
    }
    
    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/accounts/connect?error=missing_parameters", request.url)
      );
    }
    
    // Verify OAuth state
    const cookieStore = await cookies();
    const storedState = cookieStore.get("oauth_state")?.value;
    
    if (!storedState || !verifyOAuthState(state, storedState)) {
      return NextResponse.redirect(
        new URL("/accounts/connect?error=invalid_state", request.url)
      );
    }
    
    // Exchange code for tokens
    const tokens = await getTokensFromCode(code);
    
    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/accounts/connect?error=token_exchange_failed", request.url)
      );
    }
    
    // Get user email
    const email = await getUserEmail(tokens.access_token);
    
    // Calculate token expiry (expiry_date is an absolute timestamp when present)
    const expiryTime = tokens.expiry_date ?? Date.now() + 3600 * 1000;
    
    // Store account in database
    const accountId = generateAccountId();
    await createGmailAccount({
      accountId,
      userId: SINGLE_USER_ID,
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: expiryTime,
    });
    
    // Clear OAuth state cookie
    const response = NextResponse.redirect(
      new URL("/dashboard?connected=true", request.url)
    );
    response.cookies.delete("oauth_state");
    
    return response;
  } catch (error: unknown) {
    console.error("Error in OAuth callback:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.redirect(
      new URL(`/accounts/connect?error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
