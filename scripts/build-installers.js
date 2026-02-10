#!/usr/bin/env node

/**
 * Build script for generating desktop application installers
 * This script builds installers for Windows, macOS, and Linux
 * 
 * Usage:
 *   npm run build:installers
 *   npm run build:installers -- --platform=windows
 *   npm run build:installers -- --platform=macos
 *   npm run build:installers -- --platform=linux
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const platformArg = args.find(arg => arg.startsWith('--platform='));
const platform = platformArg ? platformArg.split('=')[1] : null;

const os = require('os');
const currentOS = os.platform();

const platforms = {
  windows: {
    target: 'win',
    description: 'Windows (NSIS installer)',
    canBuild: currentOS === 'win32',
  },
  macos: {
    target: 'mac',
    description: 'macOS (DMG)',
    canBuild: currentOS === 'darwin',
  },
  linux: {
    target: 'linux',
    description: 'Linux (AppImage)',
    canBuild: currentOS === 'linux',
  },
};

function buildForPlatform(targetPlatform) {
  const platformInfo = platforms[targetPlatform];
  
  if (!platformInfo.canBuild) {
    console.log(`\n⚠️  Skipping ${platformInfo.description}...`);
    console.log(`   ${platformInfo.description} can only be built on ${targetPlatform === 'windows' ? 'Windows' : targetPlatform === 'macos' ? 'macOS' : 'Linux'}`);
    console.log(`   Current OS: ${platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : platform === 'linux' ? 'Linux' : platform}`);
    return;
  }
  
  console.log(`\n🔨 Building ${platformInfo.description}...`);
  
  try {
    // Set environment variable for electron-builder
    const env = {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false', // Disable code signing for now
    };

    // Build Electron app for specific platform
    console.log(`📱 Building Electron app for ${targetPlatform}...`);
    const buildCommand = `npx electron-builder --${platformInfo.target} --x64`;
    execSync(buildCommand, { stdio: 'inherit', env });

    console.log(`✅ Successfully built ${platformInfo.description}`);
  } catch (error) {
    console.error(`❌ Failed to build ${platformInfo.description}:`, error.message);
    // Don't exit on error - continue with other platforms
  }
}

function buildAll() {
  console.log('🚀 Building installers for all platforms...\n');
  console.log(`💻 Current OS: ${currentOS === 'win32' ? 'Windows' : currentOS === 'darwin' ? 'macOS' : currentOS === 'linux' ? 'Linux' : currentOS}\n`);
  
  // Build Next.js first (shared)
  console.log('📦 Building Next.js application...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Failed to build Next.js:', error.message);
    process.exit(1);
  }

  // Build for each platform (will skip platforms that can't be built on current OS)
  const builtPlatforms = [];
  Object.keys(platforms).forEach(targetPlatform => {
    const platformInfo = platforms[targetPlatform];
    if (platformInfo.canBuild) {
      buildForPlatform(targetPlatform);
      builtPlatforms.push(targetPlatform);
    } else {
      console.log(`\n⚠️  Skipping ${platformInfo.description} (requires ${targetPlatform === 'windows' ? 'Windows' : targetPlatform === 'macos' ? 'macOS' : 'Linux'})`);
    }
  });

  if (builtPlatforms.length > 0) {
    console.log('\n✨ Build complete!');
    console.log(`📁 Installers are in the dist/ directory`);
    console.log(`✅ Built for: ${builtPlatforms.map(p => platforms[p].description).join(', ')}`);
    if (builtPlatforms.length < Object.keys(platforms).length) {
      console.log('\n💡 To build for other platforms:');
      console.log('   - macOS: Build on a Mac or use CI/CD (GitHub Actions, etc.)');
      console.log('   - Linux: Build on Linux or use CI/CD');
      console.log('   - Or use GitHub Actions for cross-platform builds');
    }
    console.log('\n📤 Next step: Run "npm run upload:installers" to upload to Supabase Storage');
  } else {
    console.log('\n⚠️  No installers could be built on this platform.');
    console.log('   This script can only build installers for the current operating system.');
  }
}

// Main execution
if (platform && platforms[platform]) {
  buildForPlatform(platform);
} else if (platform) {
  console.error(`❌ Unknown platform: ${platform}`);
  console.error(`Available platforms: ${Object.keys(platforms).join(', ')}`);
  process.exit(1);
} else {
  buildAll();
}
