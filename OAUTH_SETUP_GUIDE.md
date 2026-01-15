# Google OAuth Setup Guide

The `invalid_client` error means your Google OAuth credentials need to be configured correctly.

## Step-by-Step Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click "Select a project" → "New Project"
3. Name it "Email Genie" (or any name you prefer)
4. Click "Create"

### 2. Enable Gmail API

1. In your project, go to "APIs & Services" → "Library"
2. Search for "Gmail API"
3. Click on it and click "Enable"

### 3. Configure OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth consent screen"
2. Select "External" (unless you have Google Workspace)
3. Click "Create"
4. Fill in required fields:
   - **App name**: Email Genie
   - **User support email**: Your email
   - **Developer contact email**: Your email
5. Click "Save and Continue"
6. On "Scopes" page, click "Add or Remove Scopes"
7. Add these scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.labels`
   - `https://www.googleapis.com/auth/userinfo.email`
8. Click "Update" → "Save and Continue"
9. Add your email as a test user
10. Click "Save and Continue" → "Back to Dashboard"

### 4. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Select "Web application"
4. Name it "Email Genie Web Client"
5. Under "Authorized redirect URIs", click "Add URI"
6. Add BOTH URIs:
   ```
   http://localhost:3000/api/gmail/callback
   https://your-domain.vercel.app/api/gmail/callback
   ```
7. Click "Create"
8. **IMPORTANT**: Copy the Client ID and Client Secret

### 5. Update .env.local

Edit your `.env.local` file:

```bash
# Replace these with YOUR actual credentials from step 4
GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your_actual_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/gmail/callback

# Make sure these are also set
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-generated-secret
```

### 6. Restart Development Server

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

### 7. Test OAuth Flow

1. Go to http://localhost:3000
2. Click "Get Started" → "Connect Gmail Account"
3. You should be redirected to Google
4. Select your account
5. Review and accept permissions
6. You should be redirected back to the dashboard

## Common Issues

### "invalid_client" Error

**Cause**: Client ID or Secret is wrong, or redirect URI doesn't match

**Solution**:
1. Double-check Client ID and Secret in `.env.local`
2. Make sure there are NO extra spaces or quotes
3. Verify redirect URI in Google Console matches EXACTLY:
   ```
   http://localhost:3000/api/gmail/callback
   ```
4. Restart your dev server after changing `.env.local`

### "redirect_uri_mismatch" Error

**Cause**: The redirect URI in your request doesn't match what's in Google Console

**Solution**:
1. In Google Cloud Console → Credentials
2. Click on your OAuth client
3. Make sure `http://localhost:3000/api/gmail/callback` is listed EXACTLY (no trailing slash)
4. Add it if missing
5. Wait 5 minutes for changes to propagate

### "Access blocked: This app's request is invalid"

**Cause**: OAuth consent screen not configured or missing scopes

**Solution**:
1. Complete step 3 above (Configure OAuth Consent Screen)
2. Add all required scopes
3. Add your email as a test user
4. Try again

### "Error 403: access_denied"

**Cause**: You need to add yourself as a test user (if app is not verified)

**Solution**:
1. Go to "OAuth consent screen"
2. Scroll to "Test users"
3. Click "Add Users"
4. Add your Gmail address
5. Save and try again

## Verify Your Setup

Run this check:

```bash
# Check if credentials are set
node -e "
require('dotenv').config({ path: '.env.local' });
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✓ Set' : '✗ Missing');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✓ Set' : '✗ Missing');
console.log('GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI);
"
```

Expected output:
```
GOOGLE_CLIENT_ID: ✓ Set
GOOGLE_CLIENT_SECRET: ✓ Set
GOOGLE_REDIRECT_URI: http://localhost:3000/api/gmail/callback
```

## Production Deployment

When deploying to Vercel:

1. Add production redirect URI in Google Console:
   ```
   https://your-app.vercel.app/api/gmail/callback
   ```

2. Update environment variables in Vercel:
   ```
   GOOGLE_REDIRECT_URI=https://your-app.vercel.app/api/gmail/callback
   NEXTAUTH_URL=https://your-app.vercel.app
   ```

3. Publish your OAuth app (or keep it in testing mode with test users)

## Need More Help?

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Gmail API Documentation](https://developers.google.com/gmail/api)
- Check the main [README.md](README.md) for troubleshooting
