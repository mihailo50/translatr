#!/usr/bin/env node

/**
 * Compression script for desktop application installers
 * Compresses installers to reduce file size for upload
 * 
 * Usage:
 *   node scripts/compress-installers.js
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const distPath = path.join(process.cwd(), 'dist');

// File patterns to compress
const filePatterns = {
  windows: {
    patterns: [
      /Aether.*Setup.*\.exe$/i,
      /.*\.exe$/i,
    ],
    extension: '.zip',
  },
  macos: {
    patterns: [
      /Aether.*\.dmg$/i,
      /.*\.dmg$/i,
    ],
    extension: '.zip',
  },
  linux: {
    patterns: [
      /Aether.*\.AppImage$/i,
      /.*\.AppImage$/i,
    ],
    extension: '.zip',
  },
};

function findInstallers() {
  if (!fs.existsSync(distPath)) {
    console.error('❌ dist/ directory not found!');
    console.error('   Run "npm run build:installers" first');
    process.exit(1);
  }

  const files = fs.readdirSync(distPath);
  const installers = [];

  files.forEach(file => {
    const filePath = path.join(distPath, file);
    const stats = fs.statSync(filePath);
    
    if (!stats.isFile()) return;

    // Check each platform pattern
    Object.keys(filePatterns).forEach(platform => {
      const { patterns } = filePatterns[platform];
      if (patterns.some(pattern => pattern.test(file))) {
        installers.push({
          platform,
          path: filePath,
          name: file,
          size: stats.size,
        });
      }
    });
  });

  return installers;
}

function compressFile(fileInfo) {
  return new Promise((resolve, reject) => {
    const { platform, path: filePath, name } = fileInfo;
    const { extension } = filePatterns[platform];
    
    const compressedName = name.replace(/\.[^.]+$/, extension);
    const compressedPath = path.join(distPath, compressedName);
    
    // Skip if already compressed
    if (fs.existsSync(compressedPath)) {
      const compressedStats = fs.statSync(compressedPath);
      const originalStats = fs.statSync(filePath);
      
      // If compressed file is newer, skip
      if (compressedStats.mtime > originalStats.mtime) {
        console.log(`   ⏭️  ${compressedName} already exists and is up-to-date`);
        resolve({
          original: fileInfo,
          compressed: {
            path: compressedPath,
            name: compressedName,
            size: compressedStats.size,
          },
        });
        return;
      }
    }

    console.log(`   📦 Compressing ${name}...`);
    console.log(`   ℹ️  Note: Installers are often already compressed, so reduction may be minimal.`);
    
    // Try 7-Zip first if available (better compression), fallback to Node.js archiver
    let use7zip = false;
    
    try {
      // Check if 7z command is available
      execSync('where 7z', { stdio: 'ignore' }); // Windows
      use7zip = true;
    } catch {
      try {
        execSync('which 7z', { stdio: 'ignore' }); // Unix/Mac
        use7zip = true;
      } catch {
        // 7-Zip not available, use archiver
      }
    }
    
    if (use7zip) {
      console.log(`   Using 7-Zip for better compression...`);
      try {
        execSync(`7z a -tzip -mx=9 "${compressedPath}" "${filePath}"`, { stdio: 'inherit' });
        const compressedStats = fs.statSync(compressedPath);
        const originalSize = fileInfo.size;
        const compressedSize = compressedStats.size;
        const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);
        
        console.log(`   ✅ Compressed: ${compressedName}`);
        console.log(`      Original: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`      Compressed: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`      Reduction: ${reduction}%`);
        
        resolve({
          original: fileInfo,
          compressed: {
            path: compressedPath,
            name: compressedName,
            size: compressedSize,
          },
        });
        return;
      } catch (error) {
        console.log(`   ⚠️  7-Zip failed, falling back to Node.js archiver...`);
      }
    }
    
    // Fallback to Node.js archiver
    const output = fs.createWriteStream(compressedPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    output.on('close', () => {
      const originalSize = fileInfo.size;
      const compressedSize = archive.pointer();
      const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);
      
      console.log(`   ✅ Compressed: ${compressedName}`);
      console.log(`      Original: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`      Compressed: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`      Reduction: ${reduction}%`);
      
      resolve({
        original: fileInfo,
        compressed: {
          path: compressedPath,
          name: compressedName,
          size: compressedSize,
        },
      });
    });

    archive.on('error', (err) => {
      console.error(`   ❌ Compression failed:`, err.message);
      reject(err);
    });

    archive.pipe(output);
    archive.file(filePath, { name });
    archive.finalize();
  });
}

async function main() {
  console.log('🗜️  Compressing installers...\n');

  const installers = findInstallers();

  if (installers.length === 0) {
    console.log('ℹ️  No installer files found in dist/');
    console.log('   Run "npm run build:installers" first');
    return;
  }

  console.log(`✅ Found ${installers.length} installer(s):\n`);

  const results = [];
  for (const installer of installers) {
    try {
      const result = await compressFile(installer);
      results.push(result);
    } catch (error) {
      console.error(`❌ Failed to compress ${installer.name}:`, error.message);
    }
  }

  if (results.length > 0) {
    console.log('\n✨ Compression complete!');
    console.log(`📁 Compressed files are in the dist/ directory`);
    
    const totalOriginal = results.reduce((sum, r) => sum + r.original.size, 0);
    const totalCompressed = results.reduce((sum, r) => sum + r.compressed.size, 0);
    const totalReduction = ((1 - totalCompressed / totalOriginal) * 100).toFixed(1);
    
    console.log(`\n📊 Summary:`);
    console.log(`   Original total: ${(totalOriginal / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Compressed total: ${(totalCompressed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Total reduction: ${totalReduction}%`);
    
    console.log('\n📤 Next step: Run "npm run upload:installers" to upload compressed files');
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
