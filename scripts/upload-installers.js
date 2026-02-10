#!/usr/bin/env node

/**
 * Upload script for desktop application installers to Supabase Storage
 * 
 * Prerequisites:
 * 1. Create a "downloads" bucket in Supabase Storage (make it public)
 * 2. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env
 * 
 * Usage:
 *   npm run upload:installers
 *   npm run upload:installers -- --version=1.0.0
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Load environment variables FIRST (before any other code)
const envPath = path.join(__dirname, '..', '.env.local');
const envPathFallback = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else if (fs.existsSync(envPathFallback)) {
  require('dotenv').config({ path: envPathFallback });
} else {
  require('dotenv').config(); // Try default .env
}

const args = process.argv.slice(2);
const versionArg = args.find(arg => arg.startsWith('--version='));
const version = versionArg ? versionArg.split('=')[1] : require('../package.json').version || '0.1.0';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const bucketName = process.env.NEXT_PUBLIC_DOWNLOADS_BUCKET || 'downloads';

if (!supabaseUrl) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL in .env');
  process.exit(1);
}

// Prefer service role key (bypasses RLS), fallback to anon key
const supabaseKey = supabaseServiceKey || supabaseAnonKey;
if (!supabaseKey) {
  console.error('❌ Missing Supabase credentials!');
  console.error('   Set SUPABASE_SERVICE_ROLE_KEY (recommended) or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env');
  console.error('   Get service role key from: Supabase Dashboard → Settings → API → service_role key');
  process.exit(1);
}

// Debug: Check which key is being used (without exposing the full key)
if (supabaseServiceKey) {
  console.log('🔑 Using service role key (first 10 chars):', supabaseServiceKey.substring(0, 10) + '...');
} else {
  console.log('⚠️  Using anon key (service role key not found)');
  console.log('   Service key check:', supabaseServiceKey ? 'Found' : 'Not found');
}

// Create Supabase client with proper configuration
const supabaseOptions = supabaseServiceKey ? {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  // Service role key bypasses RLS, so we don't need additional config
} : undefined;

const supabase = createClient(supabaseUrl, supabaseKey, supabaseOptions);
const distPath = path.join(process.cwd(), 'dist');

// File patterns to look for (prefer compressed files)
const filePatterns = {
  windows: {
    patterns: [
      /Aether.*Setup.*\.zip$/i,  // Prefer compressed
      /Aether.*Setup.*\.exe$/i,
      /.*\.zip$/i,
      /.*\.exe$/i,
    ],
    contentType: {
      zip: 'application/zip',
      exe: 'application/x-msdownload',
    },
  },
  macos: {
    patterns: [
      /Aether.*\.zip$/i,  // Prefer compressed
      /Aether.*\.dmg$/i,
      /.*\.zip$/i,
      /.*\.dmg$/i,
    ],
    contentType: {
      zip: 'application/zip',
      dmg: 'application/x-apple-diskimage',
    },
  },
  linux: {
    patterns: [
      /Aether.*\.zip$/i,  // Prefer compressed
      /Aether.*\.AppImage$/i,
      /.*\.zip$/i,
      /.*\.AppImage$/i,
    ],
    contentType: {
      zip: 'application/zip',
      AppImage: 'application/x-executable',
    },
  },
};

function findInstallerFiles() {
  if (!fs.existsSync(distPath)) {
    console.error(`❌ dist/ directory not found! Please run "npm run build:installers" first.`);
    process.exit(1);
  }

  // Get all files recursively, but prioritize root-level files
  const allFiles = [];
  
  function scanDirectory(dir, depth = 0) {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const itemPath = path.join(dir, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory() && depth < 2) {
        // Only scan 2 levels deep (dist/ and dist/win-unpacked/, etc.)
        scanDirectory(itemPath, depth + 1);
      } else if (stats.isFile() && stats.size >= 1024 * 1024) {
        // Only consider files >= 1MB
        allFiles.push({
          path: itemPath,
          name: item,
          relativePath: path.relative(distPath, itemPath),
          size: stats.size,
          mtime: stats.mtime,
          depth,
        });
      }
    });
  }
  
  scanDirectory(distPath);

  const installers = {
    windows: null,
    macos: null,
    linux: null,
  };

  // Platform-specific directory/keyword hints
  const platformHints = {
    windows: [/win/i, /windows/i, /win32/i, /win64/i, /\.exe$/i],
    macos: [/mac/i, /darwin/i, /osx/i, /\.dmg$/i],
    linux: [/linux/i, /\.AppImage$/i],
  };

  // Score each file for each platform (higher = better match)
  allFiles.forEach(file => {
    const scores = {
      windows: 0,
      macos: 0,
      linux: 0,
    };

    // Check platform hints in path/filename
    Object.keys(platformHints).forEach(platform => {
      platformHints[platform].forEach(hint => {
        if (hint.test(file.relativePath) || hint.test(file.name)) {
          scores[platform] += 10;
        }
      });
    });

    // Check file patterns (more specific patterns score higher)
    Object.keys(filePatterns).forEach(platform => {
      const { patterns } = filePatterns[platform];
      patterns.forEach((pattern, index) => {
        if (pattern.test(file.name)) {
          // Earlier patterns are more specific, give higher score
          scores[platform] += (patterns.length - index) * 2;
        }
      });
    });

    // Prefer root-level files (depth 0)
    if (file.depth === 0) {
      Object.keys(scores).forEach(platform => {
        scores[platform] += 5;
      });
    }

    // Prefer compressed files
    if (/\.zip$/i.test(file.name)) {
      Object.keys(scores).forEach(platform => {
        scores[platform] += 3;
      });
    }

    // Assign to the platform with the highest score (only if score > 0)
    let bestPlatform = null;
    let bestScore = 0;
    Object.keys(scores).forEach(platform => {
      if (scores[platform] > bestScore) {
        bestScore = scores[platform];
        bestPlatform = platform;
      }
    });

    // Only assign if we have a clear winner (score > 0)
    if (bestPlatform && bestScore > 0) {
      const existing = installers[bestPlatform];
      const isCompressed = /\.zip$/i.test(file.name);
      
      // Prefer: compressed > newer > larger
      if (!existing) {
        installers[bestPlatform] = {
          path: file.path,
          name: file.name,
          size: file.size,
          isCompressed,
        };
      } else {
        const existingIsCompressed = /\.zip$/i.test(existing.name);
        const existingMtime = existing.mtime || (fs.existsSync(existing.path) ? fs.statSync(existing.path).mtime : new Date(0));
        const shouldReplace = 
          (isCompressed && !existingIsCompressed) ||
          (isCompressed === existingIsCompressed && file.mtime > existingMtime) ||
          (isCompressed === existingIsCompressed && file.mtime.getTime() === existingMtime.getTime() && file.size > existing.size);
        
        if (shouldReplace) {
          installers[bestPlatform] = {
            path: file.path,
            name: file.name,
            size: file.size,
            isCompressed,
            mtime: file.mtime,
          };
        }
      }
    }
  });

  return installers;
}

async function uploadFile(platform, fileInfo) {
  console.log(`\n📤 Uploading ${platform} installer: ${fileInfo.name} (${(fileInfo.size / 1024 / 1024).toFixed(2)} MB)...`);

  try {
    // Read file
    const fileBuffer = fs.readFileSync(fileInfo.path);
    
    // Create a versioned filename (preserve compression extension)
    const ext = path.extname(fileInfo.name);
    const simpleName = `aether-${platform}-${version}${ext}`;
    
    // Get content type based on file extension
    const contentTypeMap = filePatterns[platform].contentType;
    const contentType = typeof contentTypeMap === 'object' 
      ? contentTypeMap[ext.slice(1).toLowerCase()] || contentTypeMap[ext.slice(1)] || 'application/octet-stream'
      : contentTypeMap;
    
    // Check file size - use external storage for files > 50MB
    const fileSizeMB = fileInfo.size / 1024 / 1024;
    if (fileSizeMB > 50) {
      console.log(`   ⚠️  File exceeds Supabase limit (50MB), using external storage...`);
      return await uploadToExternalStorage(fileInfo.path, simpleName, platform, fileInfo);
    }
    
    // Upload to Supabase Storage for smaller files
    console.log(`   Uploading to bucket: ${bucketName}`);
    console.log(`   Using key type: ${supabaseServiceKey ? 'Service Role (bypasses RLS)' : 'Anon (may be blocked by RLS)'}`);
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(simpleName, fileBuffer, {
        contentType: contentType,
        upsert: true, // Overwrite if exists
        cacheControl: '3600',
      });

    if (error) {
      console.error(`   Upload error details:`, {
        message: error.message,
        statusCode: error.statusCode,
        error: error.error,
      });
      
      // If file too large, try REST API
      if (error.message.includes('maximum allowed size') || error.statusCode === '413') {
        console.log(`   File too large for SDK upload, trying REST API...`);
        return await uploadViaRESTAPI(fileInfo.path, simpleName, platform, fileInfo);
      }
      
      // If using service role and still getting RLS error, something is wrong
      if (supabaseServiceKey && error.message.includes('row-level security')) {
        console.error('\n⚠️  RLS error even with service role key!');
        console.error('   This suggests:');
        console.error('   1. The service role key might be incorrect');
        console.error('   2. Storage policies might be blocking uploads');
        console.error('   3. Check bucket policies in Supabase Dashboard → Storage → downloads → Policies');
      }
      
      throw error;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(simpleName);

    console.log(`✅ Uploaded successfully!`);
    console.log(`   URL: ${urlData.publicUrl}`);
    console.log(`   Filename: ${simpleName}`);

    return {
      platform,
      url: urlData.publicUrl,
      filename: simpleName,
      size: fileInfo.size,
    };
  } catch (error) {
    console.error(`❌ Failed to upload ${platform} installer:`, error.message);
    
    // If file too large, try REST API
    if (error.message.includes('maximum allowed size') || error.statusCode === '413') {
      console.log(`\n   File too large for SDK upload, trying REST API...`);
      try {
        return await uploadViaRESTAPI(fileInfo.path, simpleName, platform, fileInfo);
      } catch (restError) {
        console.error(`   REST API also failed:`, restError.message);
        throw restError;
      }
    }
    
    if (error.message.includes('row-level security')) {
      console.error('\n💡 Tip: Add SUPABASE_SERVICE_ROLE_KEY to .env to bypass RLS');
      console.error('   Get it from: Supabase Dashboard → Settings → API → service_role key');
    }
    
    throw error;
  }
}

async function uploadViaRESTAPI(filePath, fileName, platform, fileInfo) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  console.log(`   Reading file (${(fileInfo.size / 1024 / 1024).toFixed(2)} MB)...`);
  const fileBuffer = fs.readFileSync(filePath);
  
  console.log(`   Uploading via REST API (may support larger files)...`);
  
  try {
    // Use Supabase Storage REST API directly
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucketName}/${fileName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
        'Cache-Control': 'public, max-age=3600',
      },
      body: fileBuffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      
      throw new Error(errorData.message || `Upload failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    console.log(`✅ Uploaded successfully via REST API!`);
    console.log(`   URL: ${urlData.publicUrl}`);
    console.log(`   Filename: ${fileName}`);
    if (fileName.endsWith('.zip')) {
      console.log(`   ℹ️  This is a compressed file (.zip) - users will need to extract it`);
    }

    return {
      platform,
      url: urlData.publicUrl,
      filename: fileName,
      size: fileInfo.size,
    };
  } catch (error) {
    console.error(`   REST API upload failed:`, error.message);
    
    if (error.message.includes('maximum allowed size') || error.message.includes('413')) {
      console.error('\n❌ File is too large for Supabase Storage.');
      console.error('   Supabase Storage has a file size limit (typically 50-100MB).');
      console.error('\n   Options:');
      console.error('   1. Compress the installer (reduce size)');
      console.error('   2. Use external storage (S3, Cloudflare R2, etc.)');
      console.error('   3. Contact Supabase support to increase your project limits');
      console.error('   4. Use a CDN or file hosting service for large installers');
    }
    
    throw error;
  }
}

async function uploadToExternalStorage(filePath, fileName, platform, fileInfo) {
  const { execSync } = require('child_process');
  const scriptPath = path.join(__dirname, 'upload-to-external-storage.js');
  
  console.log(`   Using external storage (Cloudflare R2 / S3)...`);
  
  try {
    // Call the external storage upload script
    const result = execSync(`node "${scriptPath}" "${filePath}" "${platform}"`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    
    // Parse the output to get the URL
    const urlMatch = result.match(/URL:\s*(https?:\/\/[^\s]+)/);
    const filenameMatch = result.match(/Filename:\s*([^\s]+)/);
    
    if (!urlMatch) {
      throw new Error('Failed to get URL from external storage upload');
    }
    
    const url = urlMatch[1];
    const uploadedFilename = filenameMatch ? filenameMatch[1] : fileName;
    
    console.log(`✅ Uploaded to external storage!`);
    console.log(`   URL: ${url}`);
    console.log(`   Filename: ${uploadedFilename}`);
    
    // Also store metadata in Supabase (just the URL, not the file)
    // This allows the download page to know where to fetch from
    try {
      const metadata = JSON.stringify({
        url,
        filename: uploadedFilename,
        size: fileInfo.size,
        platform,
        version,
        storage: 'external',
        uploaded_at: new Date().toISOString(),
      });
      
      const metadataFileName = `aether-${platform}-${version}.json`;
      const { error: metadataError } = await supabase.storage
        .from(bucketName)
        .upload(metadataFileName, Buffer.from(metadata), {
          contentType: 'application/json',
          upsert: true,
        });
      
      if (metadataError) {
        console.warn(`   ⚠️  Could not store metadata in Supabase: ${metadataError.message}`);
      } else {
        console.log(`   ✅ Metadata stored in Supabase`);
      }
    } catch (metadataErr) {
      console.warn(`   ⚠️  Metadata storage failed: ${metadataErr.message}`);
    }
    
    return {
      platform,
      url,
      filename: uploadedFilename,
      size: fileInfo.size,
      storage: 'external',
    };
  } catch (error) {
    console.error(`   ❌ External storage upload failed:`, error.message);
    console.error(`   Make sure external storage credentials are set in .env.local:`);
    console.error(`   - EXTERNAL_STORAGE_TYPE (r2 or s3)`);
    console.error(`   - EXTERNAL_STORAGE_BUCKET`);
    console.error(`   - EXTERNAL_STORAGE_ACCESS_KEY_ID`);
    console.error(`   - EXTERNAL_STORAGE_SECRET_ACCESS_KEY`);
    if (process.env.EXTERNAL_STORAGE_TYPE === 'r2') {
      console.error(`   - CLOUDFLARE_ACCOUNT_ID`);
    }
    throw error;
  }
}

async function checkBucketExists() {
  try {
    // Try to list files in the bucket - if it works, bucket exists and is accessible
    // Anon key can't list all buckets, but can access public buckets directly
    const { data: files, error } = await supabase.storage
      .from(bucketName)
      .list('', { limit: 1 });

    if (error) {
      if (error.message.includes('not found') || error.message.includes('does not exist')) {
        console.error(`❌ Bucket "${bucketName}" not found!`);
        console.error('\n📝 Please create the bucket in Supabase Dashboard:');
        console.error(`   1. Go to Storage in your Supabase project`);
        console.error(`   2. Click "New bucket"`);
        console.error(`   3. Name it "${bucketName}"`);
        console.error(`   4. Make it PUBLIC`);
        console.error(`   5. Run this script again`);
        return false;
      } else if (error.message.includes('permission') || error.message.includes('policy')) {
        console.error(`❌ Permission error accessing bucket "${bucketName}"`);
        console.error('\n📝 Please check:');
        console.error(`   1. Bucket "${bucketName}" exists in Supabase Dashboard`);
        console.error(`   2. Bucket is set to PUBLIC`);
        console.error(`   3. Storage policies allow public access`);
        return false;
      } else {
        console.error(`❌ Error accessing bucket: ${error.message}`);
        return false;
      }
    }

    // If we can list files, bucket exists and is accessible
    console.log(`✅ Bucket "${bucketName}" is accessible`);
    if (files && files.length > 0) {
      console.log(`   Found ${files.length} existing file(s)`);
    }
    return true;
  } catch (error) {
    console.error(`❌ Error checking bucket: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Uploading installers to Supabase Storage...\n');
  console.log(`📦 Version: ${version}`);
  console.log(`📁 Bucket: ${bucketName}\n`);

  // Check if bucket exists
  const bucketExists = await checkBucketExists();
  if (!bucketExists) {
    process.exit(1);
  }

  // Find installer files
  console.log('🔍 Looking for installer files in dist/...');
  const installers = findInstallerFiles();

  const found = Object.values(installers).filter(Boolean);
  if (found.length === 0) {
    console.error('❌ No installer files found in dist/ directory!');
    console.error('   Please run "npm run build:installers" first.');
    process.exit(1);
  }

  console.log(`\n✅ Found ${found.length} installer(s):`);
  Object.entries(installers).forEach(([platform, fileInfo]) => {
    if (fileInfo) {
      console.log(`   - ${platform}: ${fileInfo.name} (${(fileInfo.size / 1024 / 1024).toFixed(2)} MB)`);
    }
  });

  // Confirm upload
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise(resolve => {
    rl.question('\n📤 Proceed with upload? (y/N): ', resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    console.log('❌ Upload cancelled.');
    process.exit(0);
  }

  // Upload files
  const results = [];
  for (const [platform, fileInfo] of Object.entries(installers)) {
    if (fileInfo) {
      try {
        const result = await uploadFile(platform, fileInfo);
        results.push(result);
      } catch (error) {
        console.error(`Failed to upload ${platform}:`, error.message);
      }
    }
  }

  // Summary
  console.log('\n✨ Upload complete!');
  console.log(`\n📊 Summary:`);
  console.log(`   Uploaded: ${results.length} file(s)`);
  results.forEach(result => {
    console.log(`   - ${result.platform}: ${result.filename}`);
  });
  console.log(`\n🌐 Download page: /download`);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
