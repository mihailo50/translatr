#!/usr/bin/env node

/**
 * Update existing metadata files to use Public Dev URL
 * This updates the URLs in metadata without re-uploading files
 * 
 * Usage:
 *   node scripts/update-metadata-urls.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const bucketName = process.env.NEXT_PUBLIC_DOWNLOADS_BUCKET || 'downloads';
const publicDevUrl = process.env.CLOUDFLARE_R2_PUBLIC_DEV_URL;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials!');
  process.exit(1);
}

if (!publicDevUrl) {
  console.error('❌ Missing CLOUDFLARE_R2_PUBLIC_DEV_URL in .env.local!');
  console.error('   Add: CLOUDFLARE_R2_PUBLIC_DEV_URL=https://pub-17f78b5e34cc4f7c9afaa13145e509af.r2.dev');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateMetadataUrls() {
  console.log('🔄 Updating metadata URLs to use Public Dev URL...\n');
  console.log(`   Public Dev URL: ${publicDevUrl}\n`);

  try {
    // List all metadata files
    const { data: files, error: listError } = await supabase.storage
      .from(bucketName)
      .list('', { limit: 100 });

    if (listError) {
      console.error('❌ Error listing files:', listError.message);
      process.exit(1);
    }

    const metadataFiles = files.filter(f => f.name.endsWith('.json') && f.name.includes('aether-'));

    if (metadataFiles.length === 0) {
      console.log('⚠️  No metadata files found');
      return;
    }

    console.log(`✅ Found ${metadataFiles.length} metadata file(s)\n`);

    for (const metadataFile of metadataFiles) {
      console.log(`📄 Processing: ${metadataFile.name}`);

      // Download existing metadata
      const { data: metadataContent, error: downloadError } = await supabase.storage
        .from(bucketName)
        .download(metadataFile.name);

      if (downloadError) {
        console.error(`   ❌ Error downloading: ${downloadError.message}`);
        continue;
      }

      const text = await metadataContent.text();
      const metadata = JSON.parse(text);

      if (metadata.storage !== 'external' || !metadata.url) {
        console.log(`   ⚠️  Skipping (not external storage)`);
        continue;
      }

      // Extract filename from old URL or use existing filename
      const oldUrl = metadata.url;
      const filename = metadata.filename || oldUrl.split('/').pop();
      
      // Build new URL using Public Dev URL
      const newUrl = `${publicDevUrl.replace(/\/$/, '')}/${filename}`;

      if (oldUrl === newUrl) {
        console.log(`   ✅ Already using Public Dev URL`);
        continue;
      }

      // Update metadata
      const updatedMetadata = {
        ...metadata,
        url: newUrl,
        updated_at: new Date().toISOString(),
      };

      // Upload updated metadata
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(metadataFile.name, JSON.stringify(updatedMetadata, null, 2), {
          contentType: 'application/json',
          upsert: true,
        });

      if (uploadError) {
        console.error(`   ❌ Error updating: ${uploadError.message}`);
      } else {
        console.log(`   ✅ Updated!`);
        console.log(`      Old: ${oldUrl}`);
        console.log(`      New: ${newUrl}`);
      }
    }

    console.log('\n✨ Done!');
    console.log('\n🧪 Test the download:');
    console.log('   node scripts/test-download.js windows');

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

updateMetadataUrls();
