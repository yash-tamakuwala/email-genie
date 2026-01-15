# Deployment Guide

This guide covers deploying Email Genie to production.

## Prerequisites

- [x] Completed local development and testing
- [x] Gmail OAuth configured in Google Cloud Console
- [x] AWS DynamoDB tables created
- [x] Vercel account created

## Step 1: Prepare for Deployment

### 1.1 Update Google OAuth Redirect URIs

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to your project → APIs & Services → Credentials
3. Click on your OAuth 2.0 Client ID
4. Add production redirect URI:
   ```
   https://your-app.vercel.app/api/gmail/callback
   ```
5. Keep localhost URI for development

### 1.2 Verify Environment Variables

Ensure all required variables are documented:

```bash
# Check .env.example has all variables
cat ENV.md
```

### 1.3 Test Production Build

```bash
npm run build
npm run start
```

Visit http://localhost:3000 and verify everything works.

## Step 2: Deploy to Vercel

### Method 1: Vercel Dashboard (Recommended)

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/your-username/email-genie.git
   git push -u origin main
   ```

2. **Import to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub repository
   - Vercel will auto-detect Next.js

3. **Configure Environment Variables**
   - Click "Environment Variables" during setup
   - Add all variables from `.env.local`:
     ```
     AWS_REGION=us-east-1
     AWS_ACCESS_KEY_ID=***
     AWS_SECRET_ACCESS_KEY=***
     DYNAMODB_TABLE_PREFIX=email-genie
     GOOGLE_CLIENT_ID=***
     GOOGLE_CLIENT_SECRET=***
     GOOGLE_REDIRECT_URI=https://your-app.vercel.app/api/gmail/callback
     N8N_WEBHOOK_SECRET=***
     AI_GATEWAY_API_KEY=***
     NEXTAUTH_URL=https://your-app.vercel.app
     NEXTAUTH_SECRET=***
     API_SECRET_KEY=***
     ```
   - Select environment: Production, Preview, Development

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Note your deployment URL

### Method 2: Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Add environment variables
vercel env add AWS_REGION
# ... repeat for all variables

# Deploy to production
vercel --prod
```

## Step 3: Configure DynamoDB for Production

### 3.1 Verify Tables Exist

```bash
# Run setup script with production AWS credentials
AWS_REGION=us-east-1 \
AWS_ACCESS_KEY_ID=*** \
AWS_SECRET_ACCESS_KEY=*** \
DYNAMODB_TABLE_PREFIX=email-genie \
npm run setup-db
```

### 3.2 Enable Production Features

1. **Point-in-Time Recovery**
   ```bash
   aws dynamodb update-continuous-backups \
     --table-name email-genie-gmail-accounts \
     --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
   ```

2. **CloudWatch Alarms**
   - Set up alarms for:
     - Read/Write capacity
     - Throttled requests
     - System errors

3. **Cost Monitoring**
   - Enable AWS Cost Explorer
   - Set up budget alerts

## Step 4: Configure Background Job (Cron)

### 4.1 Verify Vercel Cron

Ensure `vercel.json` is deployed with:
```
{
  "crons": [{
    "path": "/api/jobs/process-emails",
    "schedule": "*/2 * * * *"
  }]
}
```

### 4.2 Test Production Job Endpoint

1. Trigger the job endpoint manually:
   ```
   https://your-app.vercel.app/api/jobs/process-emails
   ```
2. Verify the response summary
3. Check Vercel logs for request
4. Verify Gmail actions applied

## Step 5: Verify Production Deployment

### 5.1 Test OAuth Flow

1. Visit `https://your-app.vercel.app`
2. Navigate to "Connect Account"
3. Complete OAuth flow
4. Verify account appears in dashboard

### 5.2 Test Rule Creation

1. Create a test rule
2. Verify it's saved in DynamoDB
3. Edit and delete to test all operations

### 5.3 Test Email Categorization

1. Send test email to connected Gmail
2. Check Jobs page status
3. Verify actions applied in Gmail
4. Check Vercel function logs
5. Verify email log in DynamoDB

### 5.4 Check Logs

**Vercel Logs:**
```bash
vercel logs
# Or in Vercel Dashboard → Logs
```

**DynamoDB Logs:**
- CloudWatch → Log groups
- Check for throttling

## Step 6: Configure Custom Domain (Optional)

### 6.1 Add Domain in Vercel

1. Go to Project Settings → Domains
2. Add your domain: `emailgenie.yourdomain.com`
3. Configure DNS:
   ```
   Type: CNAME
   Name: emailgenie
   Value: cname.vercel-dns.com
   ```

### 6.2 Update OAuth Redirect URI

1. Update in Google Cloud Console:
   ```
   https://emailgenie.yourdomain.com/api/gmail/callback
   ```

2. Update environment variable:
   ```
   GOOGLE_REDIRECT_URI=https://emailgenie.yourdomain.com/api/gmail/callback
   NEXTAUTH_URL=https://emailgenie.yourdomain.com
   ```

### 6.3 Update Job Endpoint (Optional)

If you use a custom domain, update any external cron or monitoring tools to the new URL.

## Step 7: Security Hardening

### 7.1 Enable Rate Limiting

Add to `middleware.ts`:

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const rateLimit = new Map<string, number[]>();

export function middleware(request: NextRequest) {
  const ip = request.ip ?? 'unknown';
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const max = 100; // 100 requests per minute

  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, []);
  }

  const requests = rateLimit.get(ip)!;
  const recentRequests = requests.filter(time => now - time < windowMs);
  
  if (recentRequests.length >= max) {
    return new NextResponse('Too Many Requests', { status: 429 });
  }

  recentRequests.push(now);
  rateLimit.set(ip, recentRequests);

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
```

### 7.2 Add Security Headers

Create `next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
```

### 7.3 Enable CORS (if needed)

Only for specific API routes:

```typescript
export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': 'https://your-domain.com',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    },
  });
}
```

## Step 8: Monitoring & Alerts

### 8.1 Set Up Vercel Monitoring

1. Go to Vercel Dashboard → Analytics
2. Enable Web Analytics
3. Monitor:
   - Function invocations
   - Function duration
   - Error rates
   - Response times

### 8.2 Set Up Error Tracking

Install Sentry (optional):

```bash
npm install @sentry/nextjs
```

Configure:
```javascript
// sentry.config.js
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

### 8.3 Set Up Uptime Monitoring

Use services like:
- UptimeRobot (free)
- Pingdom
- Better Uptime

Monitor:
- Homepage: https://your-app.vercel.app
- API health: https://your-app.vercel.app/api/categorize

### 8.4 Cost Monitoring

**AWS Costs:**
- Enable AWS Cost Explorer
- Set budget alerts ($10/month threshold)
- Monitor DynamoDB usage

**Vercel Costs:**
- Check function invocations
- Monitor bandwidth
- Review execution duration

**AI Gateway Costs:**
- Track API usage
- Monitor token consumption
- Set spending limits if available

## Step 9: Backup & Recovery

### 9.1 DynamoDB Backups

Enable automatic backups:

```bash
# Enable point-in-time recovery
aws dynamodb update-continuous-backups \
  --table-name email-genie-gmail-accounts \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true

# Create on-demand backup
aws dynamodb create-backup \
  --table-name email-genie-gmail-accounts \
  --backup-name email-genie-accounts-backup-$(date +%Y%m%d)
```

### 9.2 Environment Variable Backup

Store encrypted backup of environment variables:

```bash
# Export to encrypted file
vercel env pull .env.production
gpg -c .env.production
# Store .env.production.gpg securely
rm .env.production
```

### 9.3 Code Backup

Use Git and GitHub:
- Commit regularly
- Tag releases
- Enable GitHub repository backup

## Step 10: Post-Deployment Checklist

- [ ] Production deployment successful
- [ ] Custom domain configured (if applicable)
- [ ] SSL/TLS certificate active
- [ ] Google OAuth updated with production URLs
- [ ] DynamoDB tables accessible
- [ ] Background job endpoint reachable
- [ ] Environment variables configured
- [ ] Security headers enabled
- [ ] Rate limiting implemented
- [ ] Monitoring and alerts set up
- [ ] Backup strategy in place
- [ ] Error tracking configured
- [ ] Documentation updated
- [ ] Test emails processed successfully
- [ ] Performance acceptable
- [ ] Costs within budget

## Rollback Procedure

If issues occur:

### 1. Immediate Rollback

In Vercel Dashboard:
1. Go to Deployments
2. Find last working deployment
3. Click "⋯" → "Promote to Production"

### 2. Pause Background Jobs

1. Temporarily remove cron from `vercel.json` or block the job endpoint
2. Prevents new emails from being processed
3. Investigate issues

### 3. Revert Code Changes

```bash
git revert HEAD
git push origin main
# Vercel will auto-deploy
```

## Troubleshooting Production Issues

### API Errors

**Check Vercel Logs:**
```bash
vercel logs --follow
```

**Common Issues:**
- Missing environment variables
- DynamoDB connection timeout
- AI Gateway rate limits
- OAuth token expiration

### Background Job Not Running

**Checklist:**
- [ ] Vercel Cron is deployed
- [ ] Job endpoint is reachable
- [ ] Credentials are valid
- [ ] No errors in Vercel logs

### High Costs

**Optimization:**
1. Review DynamoDB usage
2. Check AI token consumption
3. Optimize AI prompts
4. Cache frequent queries
5. Reduce unnecessary API calls

### Performance Issues

**Optimization:**
1. Enable Vercel Edge Functions
2. Add caching headers
3. Optimize database queries
4. Reduce AI prompt length
5. Use SWR for client-side caching

## Maintenance Schedule

### Daily
- Check error rates in Vercel
- Review job execution logs
- Monitor email processing

### Weekly
- Review AI categorization accuracy
- Check cost reports
- Review uptime monitoring

### Monthly
- Rotate API keys
- Review and optimize rules
- Audit OAuth tokens
- Update dependencies
- Review and optimize costs

### Quarterly
- Security audit
- Performance review
- Feature planning
- User feedback review

## Support & Resources

- **Vercel Docs**: https://vercel.com/docs
- **Next.js Docs**: https://nextjs.org/docs
- **AWS DynamoDB Docs**: https://docs.aws.amazon.com/dynamodb
- **Google OAuth**: https://developers.google.com/identity/protocols/oauth2

---

🚀 Your Email Genie is now live in production!
