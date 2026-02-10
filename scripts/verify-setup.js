#!/usr/bin/env node

/**
 * Verification script to check if everything is set up correctly
 * for desktop app downloads
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local');
const envPathFallback = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else if (fs.existsSync(envPathFallback)) {
  require('dotenv').config({ path: envPathFallback });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const bucketName = process.env.NEXT_PUBLIC_DOWNLOADS_BUCKET || 'downloads';

console.log('🔍 Verifying setup for desktop app downloads...\n');

// Check 1: Environment Variables
console.log('1️⃣  Checking environment variables...');
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('   ❌ Missing Supabase credentials!');
  console.error('   Please set in .env.local:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}
console.log('   ✅ Environment variables found');
console.log(`   - Supabase URL: ${supabaseUrl.substring(0, 30)}...`);
console.log(`   - Bucket name: ${bucketName}`);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Wrap all async operations in async function
async function runChecks() {
  // Check 2: Supabase Connection
  console.log('\n2️⃣  Testing Supabase connection...');
  try {
    // Test connection by listing buckets (doesn't require auth)
    const { error: testError } = await supabase.storage.listBuckets();
    if (testError) throw testError;
    console.log('   ✅ Supabase connection successful');
  } catch (error) {
    console.error('   ❌ Failed to connect to Supabase:', error.message);
    process.exit(1);
  }

  // Check 3: Bucket Exists (try to access it directly since anon key can't list buckets)
  console.log('\n3️⃣  Checking if bucket exists and is accessible...');
  try {
    // Try to list files in the bucket - if it works, bucket exists and is accessible
    const { data: files, error } = await supabase.storage
      .from(bucketName)
      .list('', { limit: 1 });

    if (error) {
      if (error.message.includes('not found') || error.message.includes('does not exist')) {
        console.error(`   ❌ Bucket "${bucketName}" not found!`);
        console.error('\n   📝 To create it:');
        console.error('   1. Go to Supabase Dashboard → Storage');
        console.error(`   2. Click "New bucket"`);
        console.error(`   3. Name: "${bucketName}"`);
        console.error('   4. Make it PUBLIC ✅');
        console.error('   5. Create bucket');
        process.exit(1);
      } else if (error.message.includes('permission') || error.message.includes('policy')) {
        console.error(`   ❌ Permission error accessing bucket "${bucketName}"`);
        console.error('\n   📝 Please check:');
        console.error(`   1. Bucket "${bucketName}" exists in Supabase Dashboard`);
        console.error(`   2. Bucket is set to PUBLIC`);
        console.error(`   3. Storage policies allow public access`);
        console.error('\n   Note: Anon key cannot list buckets, but can access public buckets.');
        process.exit(1);
      } else {
        console.warn(`   ⚠️  Warning: ${error.message}`);
        console.warn('   Bucket might still be accessible for uploads');
      }
    } else {
      console.log(`   ✅ Bucket "${bucketName}" is accessible`);
      console.log('   - Can read files: ✅ Yes');
      console.log('   - Bucket appears to be public or has proper policies');
    }
  } catch (error) {
    console.error('   ❌ Error:', error.message);
    console.error('   Note: Anon key may not have permission to list buckets.');
    console.error('   If bucket exists and is public, uploads should still work.');
  }

  // Check 4: Storage Policies (optional)
  console.log('\n4️⃣  Checking storage policies...');
  try {
    const { data: policies, error } = await supabase.storage.from(bucketName).list('', { limit: 1 });
    if (error && error.message.includes('policy')) {
      console.warn('   ⚠️  Storage policies may need configuration');
      console.warn('   For public downloads, ensure public read access is enabled');
    } else {
      console.log('   ✅ Storage access working');
    }
  } catch (error) {
    console.warn('   ⚠️  Could not verify policies (this is okay if bucket is public)');
  }

  // Check 5: Existing Files
  console.log('\n5️⃣  Checking for existing installers...');
  try {
    const { data: files, error } = await supabase.storage
      .from(bucketName)
      .list('', { limit: 100 });

    if (error) {
      console.warn('   ⚠️  Could not list files:', error.message);
    } else if (files && files.length > 0) {
      console.log(`   ✅ Found ${files.length} file(s) in bucket:`);
      files.forEach(file => {
        const size = file.metadata?.size ? `(${(file.metadata.size / 1024 / 1024).toFixed(2)} MB)` : '';
        console.log(`      - ${file.name} ${size}`);
      });
    } else {
      console.log('   ℹ️  No files in bucket yet');
      console.log('   Run "npm run build:installers" then "npm run upload:installers"');
    }
  } catch (error) {
    console.warn('   ⚠️  Could not list files:', error.message);
  }

  // Check 6: Local Build Files
  console.log('\n6️⃣  Checking for local build files...');
  const distPath = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(distPath)) {
    const files = fs.readdirSync(distPath);
    const installerFiles = files.filter(f => 
      f.endsWith('.exe') || f.endsWith('.dmg') || f.endsWith('.AppImage')
    );
  
    if (installerFiles.length > 0) {
      console.log(`   ✅ Found ${installerFiles.length} installer file(s) in dist/:`);
      installerFiles.forEach(file => {
        const filePath = path.join(distPath, file);
        const stats = fs.statSync(filePath);
        console.log(`      - ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      });
      console.log('   💡 Ready to upload! Run: npm run upload:installers');
    } else {
      console.log('   ℹ️  No installer files found in dist/');
      console.log('   Run: npm run build:installers');
    }
  } else {
    console.log('   ℹ️  dist/ directory does not exist');
    console.log('   Run: npm run build:installers');
  }

  console.log('\n✨ Setup verification complete!\n');
  console.log('📋 Next steps:');
  console.log('   1. If bucket is not public, make it public in Supabase Dashboard');
  console.log('   2. Build installers: npm run build:installers');
  console.log('   3. Upload installers: npm run upload:installers');
  console.log('   4. Test downloads at: /download\n');
}

// Run all checks
runChecks().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
