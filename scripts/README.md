# Desktop Application Build & Upload Scripts

This directory contains scripts for building and uploading desktop application installers.

## Prerequisites

1. **Supabase Storage Bucket Setup:**
   - Go to your Supabase project dashboard
   - Navigate to **Storage**
   - Click **New bucket**
   - Name: `downloads`
   - Make it **PUBLIC** (important for downloads to work)
   - Click **Create bucket**

2. **Environment Variables:**
   Make sure your `.env.local` file contains:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   NEXT_PUBLIC_DOWNLOADS_BUCKET=downloads
   ```

## Building Installers

### Build for All Platforms
```bash
npm run build:installers
```

This will:
1. Build the Next.js application
2. Build Electron installers for Windows, macOS, and Linux
3. Output files to the `dist/` directory

### Build for Specific Platform
```bash
npm run build:installers -- --platform=windows
npm run build:installers -- --platform=macos
npm run build:installers -- --platform=linux
```

## Uploading to Supabase Storage

After building installers, upload them to Supabase Storage:

```bash
npm run upload:installers
```

Or with a specific version:
```bash
npm run upload:installers -- --version=1.0.0
```

The script will:
1. Check if the `downloads` bucket exists
2. Find all installer files in `dist/`
3. Upload them to Supabase Storage with versioned filenames
4. Provide download URLs

## File Structure

After building, your `dist/` directory will contain:
- **Windows**: `Aether Setup X.X.X.exe` (NSIS installer)
- **macOS**: `Aether-X.X.X.dmg` (DMG disk image)
- **Linux**: `Aether-X.X.X.AppImage` (AppImage)

## Download Page

Users can download the app from `/download` page, which:
- Auto-detects their operating system
- Highlights the appropriate download button
- Provides direct download links from Supabase Storage

## Troubleshooting

### Build fails
- Make sure you have all dependencies: `npm install`
- Check that electron-builder is installed: `npm list electron-builder`
- For macOS builds on non-Mac machines, you may need to use CI/CD

### Upload fails
- Verify Supabase credentials in `.env.local`
- Check that the `downloads` bucket exists and is public
- Ensure you have proper permissions in Supabase

### Downloads not working
- Verify the bucket is set to **PUBLIC** in Supabase Dashboard
- Check that files were uploaded successfully
- Verify the download URLs are accessible
