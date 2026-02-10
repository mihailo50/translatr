#!/usr/bin/env node

/**
 * Quick script to list all accessible buckets
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

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkBuckets() {
  console.log('🔍 Checking if "downloads" bucket is accessible...\n');
  console.log('ℹ️  Note: Anon key cannot list all buckets, but can access public buckets directly.\n');
  
  const bucketName = 'downloads';
  
  try {
    // Try to access the downloads bucket directly
    const { data: files, error } = await supabase.storage
      .from(bucketName)
      .list('', { limit: 10 });

    if (error) {
      if (error.message.includes('not found') || error.message.includes('does not exist')) {
        console.error(`❌ Bucket "${bucketName}" not found!`);
        console.error('\n📝 Create it:');
        console.error('   1. Go to Supabase Dashboard → Storage');
        console.error('   2. Click "New bucket"');
        console.error(`   3. Name: "${bucketName}"`);
        console.error('   4. Make it PUBLIC ✅');
        console.error('   5. Create bucket');
      } else if (error.message.includes('permission') || error.message.includes('policy')) {
        console.error(`❌ Permission error accessing "${bucketName}" bucket`);
        console.error('\n📝 Check:');
        console.error(`   1. Bucket "${bucketName}" exists`);
        console.error('   2. Bucket is PUBLIC');
        console.error('   3. Storage policies allow access');
      } else {
        console.error(`❌ Error: ${error.message}`);
      }
      process.exit(1);
    }
    
    console.log(`✅ Bucket "${bucketName}" is accessible!`);
    console.log(`   - Can read files: ✅ Yes`);
    
    if (files && files.length > 0) {
      console.log(`\n📦 Found ${files.length} file(s) in bucket:`);
      files.forEach(file => {
        const size = file.metadata?.size ? `(${(file.metadata.size / 1024 / 1024).toFixed(2)} MB)` : '';
        console.log(`   - ${file.name} ${size}`);
      });
    } else {
      console.log('   - Files: None yet');
      console.log('   - Ready for uploads!');
    }
    
    console.log('\n✅ Bucket is ready for uploads!');
    console.log('   Run: npm run upload:installers');
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

checkBuckets();
