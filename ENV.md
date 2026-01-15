# Environment Variables Setup

Create a `.env.local` file in the root directory with the following variables:

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
DYNAMODB_TABLE_PREFIX=email-genie

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/gmail/callback

# Background Job Configuration (REQUIRED for production)
CRON_SECRET=your-cron-secret

# Basic Auth Configuration (REQUIRED for production)
BASIC_AUTH_USER=your-username
BASIC_AUTH_PASSWORD=your-secure-password

# Vercel AI Gateway Configuration
AI_GATEWAY_API_KEY=your-ai-gateway-api-key

# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret

# API Configuration (for securing endpoints)
API_SECRET_KEY=your-api-secret-key
```

## Setup Instructions

1. **AWS Configuration**: Create an AWS account and get your access credentials
2. **Google OAuth**: Set up a project in Google Cloud Console and enable Gmail API
3. **Vercel AI Gateway**: 
   - Go to your Vercel dashboard → AI Gateway tab
   - Select "API Keys" → "Create key"
   - Copy the API key and set it as `AI_GATEWAY_API_KEY`
   - No gateway URL needed - the AI SDK handles routing automatically
4. **NextAuth Secret**: Generate a random string using: `openssl rand -base64 32`
5. **API Secret Key**: Generate another random string for API security
6. **Cron Secret (REQUIRED)**: Generate a secret to protect the cron job endpoint: `openssl rand -base64 32`
7. **Basic Auth (REQUIRED)**: Set a username and strong password to protect the web interface

## Security Notes

- **Basic Auth**: Protects the entire web application with HTTP Basic Authentication
- **Cron Secret**: Protects the `/api/jobs/process-emails` endpoint from unauthorized access
- Both should be set in production to secure your application
