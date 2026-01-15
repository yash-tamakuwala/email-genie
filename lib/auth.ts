import { nanoid } from "nanoid";

// For single-user setup, we use a fixed user ID
export const SINGLE_USER_ID = "default-user";

// Generate a secure random state for OAuth
export function generateOAuthState(): string {
  return nanoid(32);
}

// Verify OAuth state to prevent CSRF attacks
export function verifyOAuthState(state: string, storedState: string): boolean {
  return state === storedState;
}

// Generate account ID
export function generateAccountId(): string {
  return nanoid(16);
}

// Generate rule ID
export function generateRuleId(): string {
  return nanoid(16);
}

// Generate email log ID
export function generateEmailId(): string {
  return nanoid(16);
}

// Verify webhook signature (optional)
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // Implement HMAC signature verification if needed
  // For now, we'll use a simple secret comparison
  return signature === secret;
}

// Verify API key for internal endpoints
export function verifyApiKey(apiKey: string | null): boolean {
  const expectedKey = process.env.API_SECRET_KEY;
  if (!expectedKey || !apiKey) {
    return false;
  }
  return apiKey === expectedKey;
}

// Extract sender email from "From" header
export function extractSenderEmail(from: string): string {
  const match = from.match(/<(.+?)>/);
  return match ? match[1] : from;
}

// Extract sender domain from email
export function extractSenderDomain(email: string): string {
  const parts = email.split("@");
  return parts.length > 1 ? parts[1] : "";
}

// Check if token is expired
export function isTokenExpired(expiryTimestamp: number): boolean {
  const now = Date.now();
  // Add 5-minute buffer
  return now >= expiryTimestamp - 5 * 60 * 1000;
}
