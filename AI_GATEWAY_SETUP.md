# Vercel AI Gateway Setup

This document explains how Email Genie uses Vercel AI Gateway for email categorization.

## Overview

Email Genie uses the [Vercel AI SDK](https://ai-sdk.dev) with [AI Gateway](https://vercel.com/docs/ai-gateway/getting-started) to intelligently categorize and label incoming emails based on user-defined rules.

## How It Works

### 1. **Simple Model String Format**

The AI Gateway uses a simple `provider/model` format without needing provider configuration:

```typescript
model: "openai/gpt-4o-mini"
```

No need to:
- Import or configure providers
- Specify gateway URLs
- Manually route requests

The AI Gateway handles all provider routing automatically.

### 2. **Authentication**

Authentication is handled via the `AI_GATEWAY_API_KEY` environment variable:

```bash
AI_GATEWAY_API_KEY=your-ai-gateway-api-key
```

The AI SDK automatically uses this environment variable - no manual configuration needed.

### 3. **Structured Output**

We use `generateObject()` with Zod schemas for type-safe, structured responses:

```typescript
const result = await generateObject({
  model: "openai/gpt-4o-mini",
  system: systemPrompt,
  prompt: userPrompt,
  schema: CategorizationResultSchema,
  temperature: 0.3,
});

return result.object; // Fully typed response
```

## Setup Instructions

### Step 1: Create API Key

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to the **AI Gateway** tab
3. Click **API Keys** in the left sidebar
4. Click **Create key**
5. Copy the generated API key

### Step 2: Add to Environment Variables

Add the API key to your `.env.local`:

```bash
AI_GATEWAY_API_KEY=your-ai-gateway-api-key
```

### Step 3: Deploy

When deploying to Vercel:

1. Go to your project settings
2. Navigate to **Environment Variables**
3. Add `AI_GATEWAY_API_KEY` with your key
4. Redeploy

## Implementation Details

### Email Categorization Flow

1. **Email arrives** → Poller fetches new emails
2. **Fetch rules** → Get active rules for the account
3. **Build prompt** → Create system prompt with rules and context
4. **AI categorization** → Send to AI Gateway with structured output
5. **Parse response** → Get typed categorization result
6. **Apply actions** → Mark important, pin, archive, apply labels

### Code Location

The AI categorization logic is in `/lib/ai.ts`:

```typescript
export async function categorizeEmail(
  email: EmailData,
  rules: CategorizationRule[]
): Promise<CategorizationResult>
```

### Fallback Logic

If AI categorization fails, the system falls back to rule-based matching:
- Checks sender email/domain
- Checks subject/body keywords
- Applies first matching rule's actions

## Supported Models

The AI Gateway supports multiple providers with the format `provider/model`:

- **OpenAI**: `openai/gpt-4o-mini`, `openai/gpt-4`, `openai/gpt-3.5-turbo`
- **Anthropic**: `anthropic/claude-3-5-sonnet-20241022`
- **Google**: `google/gemini-1.5-pro`
- And more...

## Configuration Options

### Temperature

Controls randomness (0.0 = deterministic, 1.0 = creative):

```typescript
temperature: 0.3 // Good for categorization
```

### Schema

Defines the expected response structure:

```typescript
schema: CategorizationResultSchema
```

## Benefits of AI Gateway

✅ **No Provider Lock-in**: Switch between OpenAI, Anthropic, etc. by changing model string
✅ **Automatic Failover**: Configure fallbacks for high availability
✅ **Cost Optimization**: Route to cheaper models when possible
✅ **Observability**: Built-in monitoring and logging
✅ **Rate Limiting**: Automatic rate limit handling
✅ **Caching**: Reduce costs with smart caching

## Monitoring

Monitor your AI Gateway usage:

1. Go to Vercel Dashboard → AI Gateway
2. View:
   - Request volume
   - Token usage
   - Cost estimates
   - Error rates
   - Latency metrics

## Troubleshooting

### "AI categorization fails"

**Check API Key:**
```bash
# Verify in .env.local
AI_GATEWAY_API_KEY=your-ai-gateway-api-key
```

**Check Logs:**
```bash
# Look for errors in terminal
Error categorizing email with AI: ...
```

**Fallback Behavior:**
The system automatically falls back to rule-based categorization if AI fails, ensuring emails are still processed.

### "Invalid model"

Make sure model format uses forward slash:
- ✅ `openai/gpt-4o-mini`
- ❌ `openai:gpt-4o-mini`
- ❌ `gpt-4o-mini`

## References

- [Vercel AI Gateway Docs](https://vercel.com/docs/ai-gateway/getting-started)
- [AI SDK Documentation](https://ai-sdk.dev)
- [Supported Models](https://vercel.com/docs/ai-gateway/provider-options)
- [OpenAI Compatibility](https://vercel.com/docs/ai-gateway/openai-compat)
- [Anthropic Compatibility](https://vercel.com/docs/ai-gateway/anthropic-compat)
