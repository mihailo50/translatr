# Supabase Storage Setup for Desktop App Downloads

## Step 1: Create Storage Bucket

1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **New bucket**
4. Configure the bucket:
   - **Name**: `downloads`
   - **Public bucket**: ✅ **Enable this** (important for public downloads)
   - **File size limit**: Set to a reasonable limit (e.g., 500 MB)
   - **Allowed MIME types**: Leave empty or add:
     - `application/x-msdownload` (for .exe)
     - `application/x-apple-diskimage` (for .dmg)
     - `application/x-executable` (for .AppImage)
5. Click **Create bucket**

## Step 2: Set Storage Policies (Optional but Recommended)

For a public downloads bucket, you typically want:

1. Go to **Storage** > **downloads** bucket > **Policies** tab
2. Create a policy for public read access:

**Policy Name**: `Public read access`

**Policy Definition**:
```sql
-- Allow anyone to read files
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'downloads');
```

Or use the Supabase Dashboard UI:
- **Policy name**: `Public read access`
- **Allowed operation**: `SELECT`
- **Policy definition**: `bucket_id = 'downloads'`
- **Target roles**: `anon`, `authenticated`

## Step 3: Verify Environment Variables

Make sure your `.env.local` file contains:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_DOWNLOADS_BUCKET=downloads
```

## Step 4: Build and Upload Installers

1. **Build installers**:
   ```bash
   npm run build:installers
   ```

2. **Upload to Supabase**:
   ```bash
   npm run upload:installers
   ```

3. **Verify upload**:
   - Go to **Storage** > **downloads** bucket
   - You should see files like:
     - `aether-windows-0.1.0.exe`
     - `aether-macos-0.1.0.dmg`
     - `aether-linux-0.1.0.AppImage`

## Step 5: Test Downloads

1. Visit `/download` page
2. Click on a download button
3. Verify the file downloads from Supabase Storage

## Troubleshooting

### Files not accessible
- Ensure the bucket is **public**
- Check that storage policies allow public read access
- Verify the file URLs are correct

### Upload fails
- Check Supabase credentials in `.env.local`
- Verify the bucket name matches `NEXT_PUBLIC_DOWNLOADS_BUCKET`
- Ensure you have proper permissions

### Downloads slow
- Consider using a CDN in front of Supabase Storage
- Check file sizes (optimize if too large)
- Verify Supabase project region is close to your users
