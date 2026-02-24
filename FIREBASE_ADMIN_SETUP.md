# 🔑 Firebase Admin SDK Setup for Notification Service

## Why You Need This

Your notification service needs **Firebase Admin SDK credentials** to send FCM push notifications. This is DIFFERENT from the client-side Firebase config in the web app.

- **Web App** (extrahand-web-app-nextjs): Uses Firebase Client SDK (public API keys)
- **Notification Service** (extrahand-platform-notification-service): Uses Firebase Admin SDK (private keys)

---

## 🚀 Quick Setup

### Option 1: Service Account JSON (Easiest for Local Development)

**Step 1: Download Service Account Key**
```bash
1. Go to https://console.firebase.google.com
2. Select "extrahand-app" project
3. Click Settings (⚙️) → Project Settings
4. Go to "Service accounts" tab
5. Click "Generate new private key" button
6. Click "Generate key" (downloads JSON file)
```

**Step 2: Save the File**
```bash
# Save the downloaded JSON file as:
extrahand-platform-notification-service/serviceAccountKey.json

# IMPORTANT: This file is already in .gitignore (don't commit it!)
```

**Step 3: Verify**
```bash
cd extrahand-platform-notification-service
npm run dev

# Should see in logs:
# ✅ Firebase initialized with service account file
```

### Option 2: Environment Variables (Best for Production)

**Step 1: Get Values from Service Account JSON**

Open the downloaded JSON file and find these values:
```json
{
  "project_id": "extrahand-app",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@extrahand-app.iam.gserviceaccount.com"
}
```

**Step 2: Add to .env** (for local testing) or **Caprover** (for production)
```env
FIREBASE_PROJECT_ID=extrahand-app
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@extrahand-app.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour actual private key here\n-----END PRIVATE KEY-----\n"
```

**⚠️ Important:** 
- Keep the literal `\n` characters in the private key
- Wrap the entire private key in double quotes
- Don't add extra line breaks

---

## ✅ Current Status

### Your `.env` File Status

**What You Have:**
```env
✅ NODE_ENV=development
✅ PORT=4005
✅ MONGODB_URI=mongodb+srv://...
✅ MONGODB_DB=extrahand
✅ FIREBASE_PROJECT_ID=extrahand-app
✅ SERVICE_AUTH_TOKEN=...
✅ CORS_ORIGIN=http://localhost:3000,http://localhost:4000
```

**What's Missing:**
```env
❌ FIREBASE_CLIENT_EMAIL (or serviceAccountKey.json file)
❌ FIREBASE_PRIVATE_KEY (or serviceAccountKey.json file)
```

### Recommendation

**For Local Development:**
```bash
✅ Use serviceAccountKey.json file (Option 1)
   - Easier to manage
   - No need to escape newlines
   - Just download and place in project root
```

**For Production (Caprover):**
```bash
✅ Use environment variables (Option 2)
   - More secure
   - Easier to rotate keys
   - No files to manage
   - Add in Caprover → App Settings → Environment Variables
```

---

## 🧪 Testing After Setup

### 1. Start Notification Service
```bash
cd extrahand-platform-notification-service
npm run dev
```

**Check logs for:**
```
✅ Firebase initialized with service account file
# OR
✅ Firebase initialized with environment variables
```

**❌ If you see this, credentials are missing:**
```
⚠️ Failed to load Firebase credentials from env/file
❌ Firebase initialization failed
```

### 2. Test FCM Token Registration

From web app (after getting FCM token):
```bash
curl -X POST http://localhost:4005/api/v1/notifications/token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -d '{
    "token": "FCM_TOKEN_FROM_WEB_APP",
    "userId": "USER_UID",
    "platform": "web",
    "deviceId": "web_123456"
  }'
```

Should return:
```json
{ "success": true, "message": "Token registered successfully" }
```

### 3. Test Sending Notification
```bash
curl -X POST http://localhost:4005/api/v1/notifications/send \
  -H "Content-Type: application/json" \
  -H "x-service-token: ExtraHand_Secure_Token_2024_MinLength32Chars_ChangeInProduction" \
  -H "x-service-name: test" \
  -d '{
    "userId": "USER_UID",
    "notification": {
      "title": "Test",
      "body": "FCM test from backend",
      "type": "test"
    }
  }'
```

Should return:
```json
{ 
  "success": true, 
  "messageId": "projects/extrahand-app/messages/...",
  "sent": 1 
}
```

---

## 🔄 Local vs Production

### Local Development Setup

**File: .env**
```env
NODE_ENV=development
PORT=4005
MONGODB_URI=mongodb+srv://user:user@cluster0.tfvlujk.mongodb.net/...
MONGODB_DB=extrahand
FIREBASE_PROJECT_ID=extrahand-app
SERVICE_AUTH_TOKEN=ExtraHand_Secure_Token_2024_MinLength32Chars_ChangeInProduction
CORS_ORIGIN=http://localhost:3000,http://localhost:4000
```

**File: serviceAccountKey.json** (in project root)
```json
{
  "type": "service_account",
  "project_id": "extrahand-app",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "firebase-adminsdk-xxxxx@extrahand-app.iam.gserviceaccount.com",
  ...
}
```

### Production Setup (Caprover)

**Environment Variables in Caprover:**
```env
NODE_ENV=production
PORT=4005
MONGODB_URI=mongodb+srv://production_user:password@cluster...
MONGODB_DB=extrahand
FIREBASE_PROJECT_ID=extrahand-app
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@extrahand-app.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour key\n-----END PRIVATE KEY-----\n"
SERVICE_AUTH_TOKEN=ExtraHand_Secure_Token_2024_MinLength32Chars_ChangeInProduction
CORS_ORIGIN=https://extrahand.llp.trizenventures.com,https://www.extrahand.llp.trizenventures.com
```

**⚠️ No serviceAccountKey.json file in production!** Use environment variables only.

---

## 🐛 Troubleshooting

### Error: "Firebase initialization failed"
```bash
# Solution: Add credentials
# Option 1: Download serviceAccountKey.json from Firebase Console
# Option 2: Add FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY to .env
```

### Error: "Invalid private key"
```bash
# Solution: Check private key format
# Must have literal \n characters (not actual newlines)
# Example:
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

### Error: "PERMISSION_DENIED" when sending notifications
```bash
# Solution: Wrong project or expired key
# Re-download service account key from Firebase Console
# Make sure you're using "extrahand-app" project
```

### Logs show "Application Default Credentials"
```bash
# This means it's using ADC (fallback method)
# For explicit control, add service account key
```

---

## 📋 Checklist

Before marking complete:

### Local Development
- [ ] Downloaded service account JSON from Firebase Console
- [ ] Saved as `serviceAccountKey.json` in project root
- [ ] File is in `.gitignore` (already done)
- [ ] Service starts without Firebase errors
- [ ] Logs show: `✅ Firebase initialized with service account file`
- [ ] Can register FCM tokens
- [ ] Can send test notifications

### Production
- [ ] Added `FIREBASE_CLIENT_EMAIL` to Caprover env vars
- [ ] Added `FIREBASE_PRIVATE_KEY` to Caprover env vars
- [ ] Private key properly escaped with `\n` characters
- [ ] Service deployed and running
- [ ] Logs show: `✅ Firebase initialized with environment variables`
- [ ] FCM notifications successfully delivered

---

## 📞 Quick Help

**"Where do I get the service account key?"**
- Firebase Console → Project Settings → Service Accounts → Generate new private key

**"Do I need different keys for local and production?"**
- No! Same service account key works for both

**"Is it safe to use in .env?"**
- For local dev: Yes (file is in .gitignore)
- For production: Use Caprover environment variables (more secure)

**"How do I know it's working?"**
- Check logs for: `✅ Firebase initialized with...`
- Try sending a test notification
- Check if FCM tokens can be registered

---

## 🔗 Resources

- [Firebase Admin SDK Setup](https://firebase.google.com/docs/admin/setup)
- [Service Account Key Management](https://cloud.google.com/iam/docs/creating-managing-service-account-keys)
- [FCM Server Implementation](https://firebase.google.com/docs/cloud-messaging/server)
