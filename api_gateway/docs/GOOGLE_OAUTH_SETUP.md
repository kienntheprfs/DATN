# Google OAuth Setup Guide

This guide will help you set up Google OAuth authentication for the agent-web-kit frontend.

---

## 🚨 Got "The given origin is not allowed" Error? Quick Fix:

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click your OAuth Client ID
3. Under **Authorized JavaScript origins**, click **+ ADD URI**
4. Add exactly: `http://localhost:3000` (no trailing slash!)
5. Click **SAVE**
6. Wait 5 minutes, then hard refresh your browser (Ctrl+Shift+R)

See the [detailed error guide](#-error-the-given-origin-is-not-allowed-for-the-given-client-id-gsi_logger) below for more help.

---

## Prerequisites

- A Google Cloud Platform account
- The API Gateway backend running with Google OAuth configured

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API (if not already enabled)

## Step 2: Create OAuth 2.0 Credentials

### A. Configure OAuth Consent Screen (First Time Only)

1. Navigate to **APIs & Services > OAuth consent screen**
2. Choose **External** (for testing with any Google account)
3. Fill in the required fields:
   - **App name**: "DATN Chatbot" (or your preferred name)
   - **User support email**: Your email
   - **Developer contact email**: Your email
4. Click **Save and Continue**
5. On the **Scopes** page:
   - Click **Add or Remove Scopes**
   - Add these scopes (they should be available by default):
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
     - `openid`
   - Click **Update** then **Save and Continue**
6. Add test users (your email) on the **Test users** page
7. Click **Save and Continue** to finish

### B. Create OAuth Client ID

1. Navigate to **APIs & Services > Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. Select Application type: **Web application**
4. Enter Name: "DATN Chatbot Web Client"
5. **⚠️ CRITICAL: Add Authorized JavaScript origins**
   
   Click **+ ADD URI** under "Authorized JavaScript origins" and add:
   ```
   http://localhost:3000
   ```
   
   **Important Notes:**
   - NO trailing slash (❌ `http://localhost:3000/`)
   - Must include the exact port number
   - Must match where your Next.js app runs
   - If using a different port (e.g., 3001), add that too

6. **Authorized redirect URIs** (Optional for this flow, but can add):
   ```
   http://localhost:3000
   ```

7. Click **CREATE**
8. **Copy the Client ID** from the popup (format: `xxxxx-xxxxx.apps.googleusercontent.com`)
9. **Copy the Client Secret** as well (you'll need both)

### C. Verify Your Settings

1. Click on your newly created OAuth client in the credentials list
2. Verify "Authorized JavaScript origins" shows:
   - ✅ `http://localhost:3000`
3. If you need to edit, click the pencil icon, make changes, and click **SAVE**
4. **Wait 5-10 minutes** for changes to propagate to Google's servers

## Step 3: Configure Environment Variables

### Frontend (.env)

Create or update `agent-web-kit/.env`:

```env
# Agent Service URL
AGENT_URL=http://localhost:8080

# API Gateway URL
NEXT_PUBLIC_BACKEND_URL=http://localhost:8002

# Google OAuth Client ID (from Step 2)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
```

### Backend (.env)

Make sure your `api_gateway/.env` has:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxx
```

**Important:** The `GOOGLE_CLIENT_ID` should be the same in both frontend and backend!

## Step 4: Run Database Migration

The backend needs the Google OAuth fields in the database:

```bash
cd api_gateway
uv run alembic upgrade head
```

## Step 5: Start the Services

Start all services as described in the main README:

```bash
# Terminal 1: Start API Gateway
cd api_gateway
docker compose up -d
uv run uvicorn src.main:app --reload --port 8002

# Terminal 2: Start Frontend
cd agent-web-kit
npm run dev
```

## Step 6: Test the Login

1. Open your browser and navigate to: `http://localhost:3000/login`
2. Click the "Sign in with Google" button
3. Select your Google account
4. Grant permissions when prompted
5. You should be redirected to the home page, logged in

## Troubleshooting

### ⚠️ Error: "The given origin is not allowed for the given client ID" (GSI_LOGGER)

**This is the most common error!**

**Cause:** Your application's URL (`http://localhost:3000`) is not in the authorized JavaScript origins list in Google Cloud Console.

**Solution:**

1. **Go to Google Cloud Console:**
   - Navigate to: https://console.cloud.google.com/apis/credentials
   - Select your project from the dropdown

2. **Edit OAuth Client:**
   - Click on your OAuth 2.0 Client ID (e.g., "DATN Chatbot Web Client")
   - Scroll to **Authorized JavaScript origins**

3. **Add the origin:**
   - Click **+ ADD URI**
   - Enter **exactly**: `http://localhost:3000`
   - **Important checks:**
     - ✅ NO trailing slash
     - ✅ Must include `http://` (not `https://` for localhost)
     - ✅ Exact port number (3000)
     - ✅ No path after the port (e.g., no `/login`)

4. **Save and wait:**
   - Click **SAVE** at the bottom
   - **Wait 5-10 minutes** for Google to propagate changes

5. **Verify in browser:**
   - Open DevTools Console (F12)
   - Look for any errors
   - Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)

6. **Check your current origin:**
   - In browser DevTools console, type: `window.location.origin`
   - Make sure it matches **exactly** what you added in Google Console

**Common mistakes:**
- ❌ `http://localhost:3000/` (trailing slash)
- ❌ `http://localhost:3000/login` (includes path)
- ❌ `localhost:3000` (missing protocol)
- ❌ `https://localhost:3000` (wrong protocol for localhost)
- ✅ `http://localhost:3000` (CORRECT)

### Error: "redirect_uri_mismatch"

**Cause:** The redirect URI used by the frontend doesn't match the ones configured in Google Cloud Console.

**Solution:**
- Check your Google Cloud Console > Credentials > OAuth 2.0 Client IDs
- Make sure `http://localhost:3000` is in the "Authorized JavaScript origins" list
- Wait a few minutes for changes to propagate

### Error: "Invalid client_id"

**Cause:** The `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is incorrect.

**Solution:**
- Double-check the Client ID in your `.env` file
- Make sure it matches the one from Google Cloud Console
- Restart the Next.js dev server after changing `.env`
  ```bash
  # Stop the server (Ctrl+C), then:
  cd agent-web-kit
  npm run dev
  ```

### Error: "Google login failed"

**Cause:** Backend is not configured or not running.

**Solution:**
- Make sure API Gateway is running on port 8002
- Check `NEXT_PUBLIC_BACKEND_URL` in frontend `.env`
- Verify backend has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` configured
- Check API Gateway logs for errors

### Error: "The requests library is not installed"

**Cause:** Missing `requests` dependency for `google-auth`.

**Solution:**
```bash
cd api_gateway
uv add requests
```

### Token Verification Fails

**Cause:** Client ID mismatch between frontend and backend.

**Solution:**
- Ensure `GOOGLE_CLIENT_ID` in backend matches `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in frontend
- Both should be the same value from Google Cloud Console

## Security Notes

1. **Never commit your `.env` files** - they contain sensitive credentials
2. **Use environment-specific credentials** - different credentials for dev/staging/prod
3. **Restrict authorized origins** - only add trusted domains to your OAuth client
4. **Enable HTTPS in production** - Google OAuth requires HTTPS for production apps
5. **Review OAuth consent screen** - make sure privacy policy and terms of service are up to date

## Features

The Google OAuth implementation includes:

- ✅ One-tap sign-in support
- ✅ Automatic user creation/linking
- ✅ JWT token-based sessions
- ✅ Refresh token support
- ✅ Avatar and display name from Google
- ✅ Email verification (Google accounts are pre-verified)
- ✅ Persistent login state (localStorage)

## Next Steps

- Configure production domains in Google Cloud Console
- Set up HTTPS for production deployment
- Configure OAuth consent screen for public release
- Add user profile management features
- Implement logout functionality across all devices
