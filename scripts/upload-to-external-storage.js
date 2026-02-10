#!/usr/bin/env node

/**
 * Upload large installers to external storage (Cloudflare R2 / S3)
 * For files larger than 50MB that exceed Supabase Storage limits
 * 
 * Usage:
 *   node scripts/upload-to-external-storage.js <file-path> <platform>
 */

const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const args = process.argv.slice(2);
const filePath = args[0];
const platform = args[1] || 'windows';
const version = require('../package.json').version || '0.1.0';

if (!filePath || !fs.existsSync(filePath)) {
  console.error('❌ File not found:', filePath);
  process.exit(1);
}

// Configuration
const storageType = process.env.EXTERNAL_STORAGE_TYPE || 'r2'; // 'r2' or 's3'
const bucketName = process.env.EXTERNAL_STORAGE_BUCKET;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID; // For R2
const accessKeyId = process.env.EXTERNAL_STORAGE_ACCESS_KEY_ID;
const secretAccessKey = process.env.EXTERNAL_STORAGE_SECRET_ACCESS_KEY;
const endpoint = storageType === 'r2' 
  ? `https://${accountId}.r2.cloudflarestorage.com`
  : process.env.EXTERNAL_STORAGE_ENDPOINT;

if (!bucketName || !accessKeyId || !secretAccessKey) {
  console.error('❌ Missing external storage credentials!');
  console.error('   Required environment variables:');
  console.error('   - EXTERNAL_STORAGE_TYPE (r2 or s3, default: r2)');
  console.error('   - EXTERNAL_STORAGE_BUCKET');
  console.error('   - EXTERNAL_STORAGE_ACCESS_KEY_ID');
  console.error('   - EXTERNAL_STORAGE_SECRET_ACCESS_KEY');
  if (storageType === 'r2') {
    console.error('   - CLOUDFLARE_ACCOUNT_ID (for R2)');
  }
  process.exit(1);
}

// Initialize S3 client (works for both R2 and S3)
const s3Client = new S3Client({
  region: storageType === 'r2' ? 'auto' : (process.env.EXTERNAL_STORAGE_REGION || 'us-east-1'),
  endpoint: endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle: storageType === 'r2', // R2 requires path-style
});

async function uploadFile() {
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName);
  const uploadName = `aether-${platform}-${version}${ext}`;
  const fileStats = fs.statSync(filePath);
  const fileSizeMB = fileStats.size / 1024 / 1024;

  console.log(`📤 Uploading to ${storageType.toUpperCase()}...`);
  console.log(`   File: ${fileName}`);
  console.log(`   Size: ${fileSizeMB.toFixed(2)} MB`);
  console.log(`   Bucket: ${bucketName}`);
  console.log(`   Upload name: ${uploadName}`);

  try {
    const fileBuffer = fs.readFileSync(filePath);
    
    // Determine content type
    const contentTypes = {
      '.exe': 'application/x-msdownload',
      '.zip': 'application/zip',
      '.dmg': 'application/x-apple-diskimage',
      '.AppImage': 'application/x-executable',
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: uploadName,
      Body: fileBuffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=3600',
    });

    console.log(`   Uploading...`);
    await s3Client.send(command);

    // Get public URL
    // Priority: Custom Domain > Public Dev URL > Account ID URL
    const customDomain = process.env.CLOUDFLARE_R2_CUSTOM_DOMAIN;
    const publicDevUrl = process.env.CLOUDFLARE_R2_PUBLIC_DEV_URL; // e.g., https://pub-xxx.r2.dev
    
    let finalUrl;
    if (customDomain) {
      // Custom domain (production)
      finalUrl = `https://${customDomain}/${uploadName}`;
    } else if (publicDevUrl && storageType === 'r2') {
      // Public Development URL (provided by Cloudflare)
      finalUrl = `${publicDevUrl.replace(/\/$/, '')}/${uploadName}`;
    } else if (storageType === 'r2') {
      // Account ID URL (fallback)
      finalUrl = `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${uploadName}`;
    } else {
      // S3 URL
      finalUrl = `https://${bucketName}.s3.${process.env.EXTERNAL_STORAGE_REGION || 'us-east-1'}.amazonaws.com/${uploadName}`;
    }

    console.log(`✅ Uploaded successfully!`);
    console.log(`   URL: ${finalUrl}`);
    console.log(`   Filename: ${uploadName}`);

    return {
      url: finalUrl,
      filename: uploadName,
      size: fileStats.size,
      storage: storageType,
    };
  } catch (error) {
    console.error(`❌ Upload failed:`, error.message);
    throw error;
  }
}

uploadFile()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
