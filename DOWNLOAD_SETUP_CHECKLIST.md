# Desktop App Download Setup Checklist

Since you already have the `downloads` bucket created, here's what else you need:

## ✅ Quick Checklist

### 1. **Make Bucket Public** (CRITICAL)
   - Go to Supabase Dashboard → Storage → `downloads` bucket
   - Click on the bucket settings
   - Enable **"Public bucket"** toggle
   - Save changes
   - ⚠️ **This is required for downloads to work!**

### 2. **Verify Environment Variables**
   Make sure your `.env.local` has:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_DOWNLOADS_BUCKET=downloads
   ```

### 3. **Run Verification**
   ```bash
   npm run verify:downloads
   ```
   This will check:
   - ✅ Environment variables
   - ✅ Supabase connection
   - ✅ Bucket exists and is public
   - ✅ Storage access
   - ✅ Existing files

### 4. **Build Installers** (when ready)
   ```bash
   npm run build:installers
   ```
   This creates installers in the `dist/` folder.

### 5. **Upload to Supabase**
   ```bash
   npm run upload:installers
   ```
   This uploads installers to your `downloads` bucket.

## 🎯 That's It!

Once the bucket is public and you've uploaded installers, users can download from `/download`.

## 🔍 Troubleshooting

### "Bucket not found"
- Verify the bucket name is exactly `downloads`
- Check it exists in Supabase Dashboard → Storage

### "Downloads not working"
- **Most common issue**: Bucket is not public
- Go to Storage → downloads → Settings → Enable "Public bucket"

### "Upload fails"
- Check Supabase credentials in `.env.local`
- Verify you have write permissions
- Check bucket name matches `NEXT_PUBLIC_DOWNLOADS_BUCKET`

## 📝 Optional: Storage Policies

For extra security, you can set up policies, but for a public downloads bucket, it's usually not necessary if the bucket itself is public.

If you want policies:
1. Go to Storage → downloads → Policies
2. Create policy for public read access:
   - Policy name: `Public read access`
   - Allowed operation: `SELECT`
   - Policy definition: `bucket_id = 'downloads'`
   - Target roles: `anon`, `authenticated`
