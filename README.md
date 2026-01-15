# Email Genie ✨

An intelligent email categorization and labeling AI Agent built with Next.js, DynamoDB, and Vercel AI SDK.

## Features

- 🔗 **Multi-Account Gmail Integration**: Connect multiple Gmail accounts via OAuth 2.0
- 🤖 **AI-Powered Categorization**: Use Vercel AI Gateway for intelligent email analysis
- ⚙️ **Flexible Rule System**: Create AI-powered, condition-based, or hybrid rules
- 📋 **Pre-built Templates**: Quick-start with common email categorization scenarios
- ⚡ **Automatic Processing**: Background job that categorizes emails every few minutes
- 🏷️ **Smart Actions**: Auto-label, star, archive emails based on your rules
- 📊 **Activity Tracking**: Monitor all processed emails and applied actions (with DynamoDB TTL)

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TailwindCSS, shadcn/ui
- **Backend**: Next.js API Routes
- **Database**: AWS DynamoDB
- **AI**: Vercel AI SDK Gateway
- **Background Jobs**: Vercel Cron (or external cron)
- **Deployment**: Vercel
- **OAuth**: Google OAuth 2.0

## Architecture

```
┌─────────┐         ┌──────────────┐         ┌─────────────┐
│  Gmail  │────────>│ Background    │────────>│  Next.js    │
│ Account │  (New   │ Job (Cron)    │ (API)   │  API Routes │
└─────────┘  Email) └──────────────┘         └──────┬──────┘
                                                    │
                                       ┌────────────┼────────────┐
                                       │            │            │
                                       v            v            v
                                 ┌─────────┐  ┌─────────┐  ┌─────────┐
                                 │DynamoDB │  │ Gmail   │  │ Vercel  │
                                 │  Rules  │  │  API    │  │   AI    │
                                 └─────────┘  └─────────┘  └─────────┘
```

## Getting Started

### Prerequisites

1. Node.js 18+ and npm
2. AWS Account (for DynamoDB)
3. Google Cloud Project (for Gmail OAuth)
4. Vercel Account (for deployment)

### 1. Clone and Install

```bash
git clone <your-repo>
cd email-genie
npm install
```

### 2. Environment Variables

Create a `.env.local` file in the root directory. See `ENV.md` for detailed instructions.

Required variables:
- AWS credentials (DynamoDB)
- Google OAuth credentials
- Cron secret (optional)
- Vercel AI Gateway URL
- API secret keys

### 3. Set Up DynamoDB Tables

```bash
npm run setup-db
```

This will create three tables:
- `email-genie-gmail-accounts`
- `email-genie-categorization-rules`
- `email-genie-email-logs`

### 4. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable Gmail API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3000/api/gmail/callback`
6. Copy Client ID and Client Secret to `.env.local`

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Connect Gmail Account

1. Navigate to Dashboard
2. Click "Connect Gmail Account"
3. Authorize with Google
4. Account will appear in dashboard

### 7. Create Categorization Rules

1. Go to "Manage Rules" for your connected account
2. Use a template or create custom rule
3. Configure conditions and actions
4. Save and enable the rule

### 8. Background Processing

Email Genie uses a background job (cron) to poll Gmail and process new emails automatically.
If deploying on Vercel, the cron is configured in `vercel.json` and runs every 2 minutes.

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

```bash
# Or use Vercel CLI
npm install -g vercel
vercel
```

### Background Job Endpoint

The cron job calls the endpoint:
```
https://your-app.vercel.app/api/jobs/process-emails
```

## API Documentation

### POST `/api/categorize`

Categorize an incoming email (internal/testing endpoint).

**Headers:**
```
x-api-key: your-api-secret-key
Content-Type: application/json
```

**Body:**
```json
{
  "accountId": "string",
  "messageId": "string",
  "from": "sender@example.com",
  "subject": "Email subject",
  "body": "Email body content",
  "snippet": "Email preview"
}
```

**Response:**
```json
{
  "success": true,
  "categorization": {
    "shouldMarkImportant": false,
    "shouldPinConversation": false,
    "shouldSkipInbox": true,
    "suggestedLabels": ["Newsletter"],
    "reasoning": "Matched rule: Newsletter Auto-Archive",
    "confidence": 0.95
  },
  "appliedActions": ["archived", "applied_labels:Newsletter"]
}
```

### Other API Endpoints

- `GET /api/gmail/connect` - Initiate OAuth flow
- `GET /api/gmail/callback` - OAuth callback
- `GET /api/gmail/accounts` - List connected accounts
- `DELETE /api/gmail/accounts?accountId={id}` - Disconnect account
- `GET /api/rules?accountId={id}` - List rules
- `POST /api/rules` - Create rule
- `PUT /api/rules` - Update rule
- `DELETE /api/rules?accountId={id}&ruleId={id}` - Delete rule

## Rule Types

### AI-Powered Rules

Use natural language to describe categorization logic:

```
"Mark emails as important if they mention urgent deadlines, 
client meetings, or require immediate action."
```

### Condition-Based Rules

Exact matching based on:
- Sender email addresses
- Sender domains
- Subject keywords
- Body content keywords

### Hybrid Rules

Combine conditions with AI analysis for the best of both worlds.

## Rule Templates

Pre-built templates included:
1. **Newsletter Auto-Archive** - Automatically archive newsletters
2. **Important Sender Detection** - Flag emails from key contacts
3. **Urgent Email Identification** - AI-powered urgency detection
4. **Customer Support Priority** - Prioritize support requests
5. **Personal vs Work Categorization** - Separate personal and work emails
6. **Invoice & Payment Tracking** - Organize financial emails

## Testing

### Test the API Locally

```bash
# Test categorization endpoint
curl -X POST http://localhost:3000/api/categorize \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-secret-key" \
  -d '{
    "accountId": "your-account-id",
    "messageId": "test-123",
    "from": "test@example.com",
    "subject": "Test Email",
    "body": "This is a test email",
    "snippet": "This is a test..."
  }'
```

### Test with Real Emails

1. Ensure the background job is running (Vercel Cron)
2. Send a test email to your connected Gmail
3. Check the Jobs page for the latest run
4. Verify actions applied in Gmail
5. Check DynamoDB email logs

### Manual Rule Testing

Use the rule builder interface to test rules before saving:
1. Create or edit a rule
2. Use "Test Rule" button (if implemented)
3. Provide sample email data
4. See predicted categorization

## Monitoring

### Check Email Logs

Email logs are stored in DynamoDB with automatic deletion after 90 days (TTL).

Query recent logs:
```javascript
import { getRecentEmailLogs } from '@/lib/dynamodb';
const logs = await getRecentEmailLogs(accountId, 7); // Last 7 days
```

### Monitor Job Runs

1. Visit `/jobs` in the app
2. Review last run status and counts
3. Check success/failure rates
4. Inspect Vercel logs if needed

### Vercel Logs

```bash
vercel logs
```

## Troubleshooting

### OAuth Issues

- **Error: redirect_uri_mismatch**
  - Update redirect URI in Google Cloud Console
  - Must match exactly: `https://your-domain.com/api/gmail/callback`

- **Error: invalid_grant**
  - Re-authenticate Gmail account
  - Check if OAuth tokens are expired

### API Errors

- **401 Unauthorized**
  - Verify API secret key is correct
  - Check job endpoint authentication (if CRON_SECRET is set)

- **500 Internal Server Error**
  - Check Vercel logs for details
  - Verify DynamoDB credentials
  - Check AI Gateway configuration

### Rule Not Working

- Ensure rule is enabled
- Check rule priority (lower = higher priority)
- Verify conditions match your emails
- Test AI prompt with sample emails

### Background Job Not Running

- Verify Vercel Cron is enabled and deployed
- Check `/jobs` page for last run status
- Trigger a manual run from the Jobs page
- Review Vercel logs for errors

## Security Best Practices

1. **Never commit `.env.local`** - Already in `.gitignore`
2. **Rotate API keys** - Change periodically
3. **Use environment variables** - For all secrets
4. **Monitor access** - Check DynamoDB and API logs
5. **Limit OAuth scopes** - Only request necessary permissions
6. **Use HTTPS** - Always in production
7. **Validate inputs** - API routes validate all inputs
8. **Rate limiting** - Implement if needed for production

## Performance Optimization

### DynamoDB

- Use on-demand billing for variable workloads
- Enable point-in-time recovery for critical data
- Use TTL for automatic cleanup (implemented for email logs)
- Implement efficient query patterns with GSI

### API Routes

- Cache frequently accessed rules
- Batch process multiple emails if possible
- Optimize AI prompts for faster responses
- Implement retry logic for transient failures

### AI Gateway

- Use appropriate temperature settings (0.3 for consistency)
- Limit token usage with maxTokens
- Cache AI responses for similar emails
- Monitor AI API costs

## Cost Estimation

### AWS DynamoDB
- **Free Tier**: 25GB storage, 25 WCU, 25 RCU
- **Estimated**: $0-5/month for single user

### Background Jobs (Vercel Cron)
- **Hobby**: External cron required
- **Pro**: $20/month (includes Vercel Cron)

### Vercel
- **Hobby**: Free for personal projects
- **Pro**: $20/month for production

### AI Gateway
- Depends on provider (OpenAI, Anthropic, etc.)
- Estimated: $5-20/month based on usage

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check this README and setup guides
2. Review troubleshooting section
3. Check Vercel documentation
4. Open an issue on GitHub

## Roadmap

- [ ] Activity dashboard with charts
- [ ] Email preview and testing interface
- [ ] Bulk rule import/export
- [ ] Multi-user authentication
- [ ] Gmail push notifications (Pub/Sub)
- [ ] Support for other email providers
- [ ] Mobile app
- [ ] Advanced analytics

## Acknowledgments

- Built with [Next.js](https://nextjs.org)
- UI components from [shadcn/ui](https://ui.shadcn.com)
- Powered by [Vercel AI SDK](https://sdk.vercel.ai)
- Background scheduling via Vercel Cron

---

Made with ❤️ by Email Genie Team
