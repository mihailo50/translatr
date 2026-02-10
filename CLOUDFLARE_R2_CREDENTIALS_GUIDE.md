# How to Find Cloudflare R2 Credentials

## Step-by-Step Guide

### 1. Account ID ✅ (You have this)
- Found in your R2 dashboard URL: `https://dash.cloudflare.com/[ACCOUNT_ID]/r2`
- Or look at the sidebar when viewing R2 buckets

### 2. Access Key ID & Secret Access Key (Need to create)

**Option A: Via R2 Dashboard**
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **R2** in the sidebar
3. Look for **"Manage R2 API Tokens"** button (usually top right)
4. Click **"Create API Token"**
5. Fill in:
   - **Token name:** `Aether Downloads` (or any name)
   - **Permissions:** 
     - Select **"Object Read & Write"** (or at least "Object Write")
     - Select your bucket name (or "All buckets")
   - Click **"Create API Token"**
6. **Copy both values immediately:**
   - `Access Key ID` (looks like: `a1b2c3d4e5f6g7h8i9j0`)
   - `Secret Access Key` (looks like: `abcdef1234567890...` - long string)
   - ⚠️ **The Secret Access Key is only shown once!**

**Option B: Direct Link**
- Go to: `https://dash.cloudflare.com/[YOUR_ACCOUNT_ID]/r2/api-tokens`
- Replace `[YOUR_ACCOUNT_ID]` with your actual account ID

**Option C: Via Workers & Pages**
1. Go to **Workers & Pages** → **R2** → **API Tokens**
2. Click **"Create API Token"**

### 3. Add to `.env.local`

Once you have all three values:

```env
EXTERNAL_STORAGE_TYPE=r2
EXTERNAL_STORAGE_BUCKET=your-bucket-name
EXTERNAL_STORAGE_ACCESS_KEY_ID=your_access_key_id_here
EXTERNAL_STORAGE_SECRET_ACCESS_KEY=your_secret_access_key_here
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
```

### 4. Test the Setup

Run the upload script to test:
```bash
npm run upload:installers
```

If credentials are correct, you'll see:
```
📤 Uploading to R2...
✅ Uploaded to external storage!
```

## Troubleshooting

**"Cannot find Manage R2 API Tokens"**
- Try the direct link: `https://dash.cloudflare.com/[ACCOUNT_ID]/r2/api-tokens`
- Or go to: Workers & Pages → R2 → API Tokens

**"Lost my Secret Access Key"**
- You need to create a new API token (old one can't be retrieved)
- Delete the old token and create a new one

**"Permission denied" errors**
- Make sure the API token has "Object Write" or "Object Read & Write" permissions
- Make sure the token has access to your specific bucket (or "All buckets")

**"Bucket not found"**
- Make sure `EXTERNAL_STORAGE_BUCKET` matches your bucket name exactly
- Check bucket name in R2 dashboard (case-sensitive)
