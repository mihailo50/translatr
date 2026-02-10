#!/usr/bin/env node

/**
 * Test download functionality locally
 * Checks if metadata files exist and verifies URLs are accessible
 * 
 * Usage:
 *   node scripts/test-download.js [platform]
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const bucketName = process.env.NEXT_PUBLIC_DOWNLOADS_BUCKET || 'downloads';
const platform = process.argv[2] || 'windows';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials!');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDownload() {
  console.log(`🔍 Testing download for platform: ${platform}\n`);

  try {
    // List files in bucket
    const { data: files, error: listError } = await supabase.storage
      .from(bucketName)
      .list('', { limit: 100 });

    if (listError) {
      console.error('❌ Error listing files:', listError.message);
      process.exit(1);
    }

    if (!files || files.length === 0) {
      console.error('❌ No files found in bucket');
      process.exit(1);
    }

    console.log(`✅ Found ${files.length} file(s) in bucket\n`);

    // Find metadata file for this platform
    const metadataFile = files.find(
      (f) => f.name.endsWith('.json') && 
             (f.name.includes(`aether-${platform}`) || f.name.includes(platform))
    );

    if (!metadataFile) {
      console.log(`⚠️  No metadata file found for ${platform}`);
      console.log('   Looking for files matching pattern...\n');
      
      // Try to find installer files directly
      const extensions = platform === 'windows' ? ['.exe', '.zip'] :
                        platform === 'macos' ? ['.dmg', '.zip'] :
                        ['.AppImage', '.zip'];
      
      const installerFiles = files.filter(f => 
        extensions.some(ext => f.name.endsWith(ext)) || f.name.includes(platform)
      );

      if (installerFiles.length > 0) {
        console.log(`✅ Found installer file(s):`);
        installerFiles.forEach(f => {
          console.log(`   - ${f.name} (${(f.metadata?.size / 1024 / 1024).toFixed(2)} MB)`);
        });
      } else {
        console.log(`❌ No installer files found for ${platform}`);
      }
      return;
    }

    console.log(`✅ Found metadata file: ${metadataFile.name}\n`);

    // Download and parse metadata
    const { data: metadataContent, error: metadataError } = await supabase.storage
      .from(bucketName)
      .download(metadataFile.name);

    if (metadataError) {
      console.error('❌ Error downloading metadata:', metadataError.message);
      process.exit(1);
    }

    const text = await metadataContent.text();
    const metadata = JSON.parse(text);

    console.log('📄 Metadata:');
    console.log(`   Platform: ${metadata.platform}`);
    console.log(`   Filename: ${metadata.filename}`);
    console.log(`   Size: ${(metadata.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Storage: ${metadata.storage}`);
    console.log(`   URL: ${metadata.url}\n`);

    if (metadata.storage === 'external' && metadata.url) {
      console.log('🌐 Testing external storage URL...');
      
      // Test if URL is accessible
      try {
        const response = await fetch(metadata.url, { method: 'HEAD' });
        
        if (response.ok) {
          console.log(`✅ URL is accessible!`);
          console.log(`   Status: ${response.status} ${response.statusText}`);
          console.log(`   Content-Type: ${response.headers.get('content-type')}`);
          console.log(`   Content-Length: ${(parseInt(response.headers.get('content-length') || '0') / 1024 / 1024).toFixed(2)} MB`);
          console.log(`\n🔗 Direct download URL:`);
          console.log(`   ${metadata.url}`);
          console.log(`\n🔗 API route URL:`);
          console.log(`   http://localhost:3000/api/downloads/${platform}`);
        } else {
          console.log(`⚠️  URL returned status: ${response.status} ${response.statusText}`);
          console.log(`   This might mean:`);
          console.log(`   - The bucket is not public`);
          console.log(`   - CORS is blocking the request`);
          console.log(`   - The file doesn't exist at that URL`);
        }
      } catch (fetchError) {
        console.error(`❌ Error testing URL:`, fetchError.message);
        console.log(`\n💡 Make sure:`);
        console.log(`   1. The Public Dev URL is enabled in Cloudflare R2`);
        console.log(`   2. The bucket allows public access`);
        console.log(`   3. CORS is configured if needed`);
      }
    } else {
      console.log('⚠️  Metadata does not contain external storage URL');
      console.log('   This file might be in Supabase Storage instead');
    }

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

testDownload();
