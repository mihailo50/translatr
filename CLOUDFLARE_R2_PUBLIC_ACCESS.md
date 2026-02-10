# Making Cloudflare R2 Files Publicly Accessible

Since your installers are stored in Cloudflare R2, you need to make them publicly accessible. Here are the steps:

## Option 1: Public Development URL (Easiest - Already Enabled!)

Cloudflare provides a Public Development URL for testing. You already have this:

```
https://pub-17f78b5e34cc4f7c9afaa13145e509af.r2.dev
```

**To use it:**
1. Add to `.env.local`:
   ```env
   CLOUDFLARE_R2_PUBLIC_DEV_URL=https://pub-17f78b5e34cc4f7c9afaa13145e509af.r2.dev
   ```

2. Re-upload your installers (or the script will use this URL automatically):
   ```bash
   npm run upload:installers
   ```

**Test the URL:**
```bash
curl -I https://pub-17f78b5e34cc4f7c9afaa13145e509af.r2.dev/aether-windows-0.1.0.zip
```

## Option 2: Public Bucket (Recommended for Production)

1. **Go to Cloudflare Dashboard → R2**
2. **Select your bucket** (e.g., `aether-downloads`)
3. **Go to Settings → Public Access**
4. **Enable "Public Access"** or **"Allow Access"**
5. **Save changes**

This makes all files in the bucket publicly accessible via their URLs.

## Option 2: Custom Domain (Better for Production)

1. **Go to Cloudflare Dashboard → R2 → Your Bucket → Settings**
2. **Scroll to "Public Access" or "Custom Domain"**
3. **Add a custom domain** (e.g., `downloads.yourdomain.com`)
4. **Follow the DNS setup instructions**
5. **Update your `.env.local`**:
   ```env
   CLOUDFLARE_R2_CUSTOM_DOMAIN=downloads.yourdomain.com
   ```

## Option 3: R2 Public Access via API

If you can't enable public access directly:

1. **Create an R2 API Token** with read permissions
2. **Use R2's public URL format**:
   ```
   https://[ACCOUNT_ID].r2.cloudflarestorage.com/[BUCKET_NAME]/[FILE_NAME]
   ```

## CORS Configuration (if needed)

If you're getting CORS errors:

1. **Go to Cloudflare Dashboard → R2 → Your Bucket → Settings**
2. **Find "CORS Policy" or "Cross-Origin Resource Sharing"**
3. **Add CORS rules**:
   ```json
   [
     {
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

## Testing

After making the bucket public, test the URL:
```bash
curl -I https://[YOUR_BUCKET].[ACCOUNT_ID].r2.cloudflarestorage.com/aether-windows-0.1.0.zip
```

You should get a `200 OK` response, not `403 Forbidden`.

## Current URL Format

Your files are accessible at:
```
https://[BUCKET_NAME].[ACCOUNT_ID].r2.cloudflarestorage.com/[FILE_NAME]
```

Example:
```
https://aether-downloads.b5ca10745520ae8883718f55d7ee31de.r2.cloudflarestorage.com/aether-windows-0.1.0.zip
```

If this URL returns `403 Forbidden`, the bucket is not public. Enable public access in the R2 dashboard.
