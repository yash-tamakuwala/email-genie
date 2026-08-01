import { GmailAccount, updateGmailAccountLastCheck, updateGmailAccountTokens } from "@/lib/dynamodb";
import { getMessage, listMessageIdsSince, refreshAccessToken } from "@/lib/gmail";
import { isTokenExpired } from "@/lib/auth";

const DEFAULT_LOOKBACK_MS = 10 * 60 * 1000; // 10 minutes
const OVERLAP_MS = 30 * 1000; // 30 seconds to avoid missing edge cases
const MAX_ACCESS_TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // Guard against bad expiry timestamps

export interface PolledEmail {
  accountId: string;
  messageId: string;
  from: string;
  subject: string;
  body: string;
  snippet: string;
}

export interface PollResult {
  emails: PolledEmail[];
  nextLastCheck: number;
  accessToken: string;
  refreshToken: string;
}

async function ensureValidTokens(account: GmailAccount): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const now = Date.now();
  const expiryIsPlausible =
    Number.isFinite(account.tokenExpiry) &&
    account.tokenExpiry > 0 &&
    account.tokenExpiry - now <= MAX_ACCESS_TOKEN_TTL_MS;

  if (expiryIsPlausible && !isTokenExpired(account.tokenExpiry)) {
    return { accessToken: account.accessToken, refreshToken: account.refreshToken };
  }

  const refreshed = await refreshAccessToken(account.refreshToken);

  if (refreshed.access_token) {
    await updateGmailAccountTokens(
      account.userId,
      account.accountId,
      refreshed.access_token,
      refreshed.refresh_token || account.refreshToken,
      refreshed.expiry_date || Date.now() + 3600 * 1000
    );

    return {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || account.refreshToken,
    };
  }

  return { accessToken: account.accessToken, refreshToken: account.refreshToken };
}

export async function pollAccountForEmails(account: GmailAccount): Promise<PollResult> {
  const now = Date.now();
  const lastCheck = account.lastEmailCheck ?? now - DEFAULT_LOOKBACK_MS;
  const sinceMs = Math.max(lastCheck - OVERLAP_MS, 0);

  const { accessToken, refreshToken } = await ensureValidTokens(account);
  const messageRefs = await listMessageIdsSince(accessToken, refreshToken, sinceMs);

  const emails: PolledEmail[] = [];
  const seenMessageIds = new Set<string>();

  for (const ref of messageRefs) {
    if (!ref.id || seenMessageIds.has(ref.id)) {
      continue;
    }
    seenMessageIds.add(ref.id);

    try {
      const parsed = await getMessage(accessToken, refreshToken, ref.id);
      
      emails.push({
        accountId: account.accountId,
        messageId: parsed.messageId,
        from: parsed.from,
        subject: parsed.subject,
        body: parsed.body,
        snippet: parsed.snippet,
      });
    } catch (error) {
      console.error(`Failed to fetch message ${ref.id} for account ${account.accountId}:`, error);
    }
  }

  await updateGmailAccountLastCheck(account.userId, account.accountId, now);

  return {
    emails,
    nextLastCheck: now,
    accessToken,
    refreshToken,
  };
}
