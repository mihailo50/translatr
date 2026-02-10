# External Storage Setup

## Quick Start

1. **Set up Cloudflare R2** (recommended) or AWS S3
2. **Add credentials to `.env.local`** (see `EXTERNAL_STORAGE_SETUP.md`)
3. **Run upload:** `npm run upload:installers`

Files > 50MB will automatically upload to external storage.

## How It Works

- **Files ≤ 50MB:** Upload to Supabase Storage
- **Files > 50MB:** Upload to external storage (R2/S3)
- **Metadata:** Stored in Supabase for download page lookup

The download page automatically detects and uses external storage URLs.
