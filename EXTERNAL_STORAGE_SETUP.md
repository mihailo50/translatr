# External Storage Setup for Large Installers

Since Supabase Storage has a 50MB file size limit, installers larger than 50MB are automatically uploaded to external storage (Cloudflare R2 or AWS S3).

## Setup Instructions

### Option 1: Cloudflare R2 (Recommended - Free Tier, No Egress Fees)

1. **Create a Cloudflare R2 Bucket:**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - Navigate to R2 → Create bucket
   - Name it (e.g., `aether-downloads`)
   - Make it public (or set up a custom domain)

2. **Get Your Credentials:**
   
   **Account ID** (you already have this):
   - Found in the R2 dashboard URL: `https://dash.cloudflare.com/[ACCOUNT_ID]/r2`
   - Or in the sidebar when viewing R2
   
   **Access Key ID & Secret Access Key** (you need to create these):
   - Go to Cloudflare Dashboard → R2
   - Click on "Manage R2 API Tokens" (usually in the top right or in the R2 sidebar)
   - OR go directly to: `https://dash.cloudflare.com/[ACCOUNT_ID]/r2/api-tokens`
   - Click "Create API Token"
   - Give it a name (e.g., "Aether Downloads")
   - Set permissions:
     - **Object Read & Write** (or at least **Object Write** for uploads)
     - Select your bucket or "All buckets"
   - Click "Create API Token"
   - **IMPORTANT:** Copy both the `Access Key ID` and `Secret Access Key` immediately
     - The Secret Access Key is only shown once and cannot be retrieved later!
     - If you lose it, you'll need to create a new token

3. **Add to `.env.local`:**
   ```env
   EXTERNAL_STORAGE_TYPE=r2
   EXTERNAL_STORAGE_BUCKET=aether-downloads
   EXTERNAL_STORAGE_ACCESS_KEY_ID=your_access_key_id
   EXTERNAL_STORAGE_SECRET_ACCESS_KEY=your_secret_access_key
   CLOUDFLARE_ACCOUNT_ID=your_account_id
   
   # Public Development URL (from R2 bucket settings)
   CLOUDFLARE_R2_PUBLIC_DEV_URL=https://pub-17f78b5e34cc4f7c9afaa13145e509af.r2.dev
   
   # Optional: Custom domain for R2 (production)
   CLOUDFLARE_R2_CUSTOM_DOMAIN=downloads.yourdomain.com
   ```

### Option 2: AWS S3

1. **Create an S3 Bucket:**
   - Go to [AWS Console](https://console.aws.amazon.com/s3/)
   - Create bucket (e.g., `aether-downloads`)
   - Enable public read access (or use CloudFront)

2. **Get Your Credentials:**
   - Go to IAM → Users → Create user
   - Attach policy: `AmazonS3FullAccess` (or custom policy)
   - Create access key
   - Copy `Access Key ID` and `Secret Access Key`

3. **Add to `.env.local`:**
   ```env
   EXTERNAL_STORAGE_TYPE=s3
   EXTERNAL_STORAGE_BUCKET=aether-downloads
   EXTERNAL_STORAGE_ACCESS_KEY_ID=your_access_key_id
   EXTERNAL_STORAGE_SECRET_ACCESS_KEY=your_secret_access_key
   EXTERNAL_STORAGE_REGION=us-east-1
   EXTERNAL_STORAGE_ENDPOINT=https://s3.amazonaws.com
   ```

## Usage

Once configured, the upload script will automatically:
- Upload files ≤ 50MB to Supabase Storage
- Upload files > 50MB to external storage (R2/S3)
- Store metadata in Supabase for the download page

Run:
```bash
npm run upload:installers
```

## Testing

Test the external storage upload:
```bash
node scripts/upload-to-external-storage.js dist/Aether\ Setup\ 0.1.0.zip windows
```

## Notes

- **Cloudflare R2** is recommended because:
  - Free tier: 10GB storage, unlimited egress
  - S3-compatible API
  - No egress fees (unlike S3)
  
- **File Size Limits:**
  - Supabase Storage: 50MB max
  - Cloudflare R2: 5GB per object (free tier)
  - AWS S3: 5TB per object

- **Metadata Storage:**
  - For files > 50MB, metadata (URL, size, etc.) is stored in Supabase
  - The download page reads this metadata to get the external URL
