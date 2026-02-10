"use server";

import { createClient } from "../../utils/supabase/server";

export interface DownloadLink {
  platform: "windows" | "macos" | "linux";
  url: string;
  filename: string;
  version: string;
  size?: string;
  updatedAt?: string;
}

export interface DownloadInfo {
  version: string;
  downloads: DownloadLink[];
}

/**
 * Get download links for desktop applications
 * Checks Supabase Storage first, falls back to public folder
 */
export async function getDownloadLinks(): Promise<DownloadInfo> {
  const supabase = await createClient();
  
  // Try to fetch download links from Supabase Storage
  // For now, we'll use a simple approach with environment variables or defaults
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://localhost:3000";
  const storageBucket = process.env.NEXT_PUBLIC_DOWNLOADS_BUCKET || "downloads";
  
  // Default download links (can be overridden by Supabase Storage)
  const defaultDownloads: DownloadLink[] = [
    {
      platform: "windows",
      url: `${baseUrl}/api/downloads/windows`,
      filename: "Aether-Setup.exe",
      version: "0.1.0",
    },
    {
      platform: "macos",
      url: `${baseUrl}/api/downloads/macos`,
      filename: "Aether.dmg",
      version: "0.1.0",
    },
    {
      platform: "linux",
      url: `${baseUrl}/api/downloads/linux`,
      filename: "Aether.AppImage",
      version: "0.1.0",
    },
  ];

  // Try to fetch from Supabase Storage if configured
  try {
    const { data: files, error } = await supabase.storage
      .from(storageBucket)
      .list("", {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });

    if (!error && files && files.length > 0) {
      // Map storage files to download links
      const storageBaseUrl = supabase.storage
        .from(storageBucket)
        .getPublicUrl("").data.publicUrl.replace(/\/$/, "");

      const downloads: DownloadLink[] = [];

      // Helper function to get download link for a platform
      const getDownloadLink = async (platform: "windows" | "macos" | "linux", extensions: string[]) => {
        // First, check for metadata file (external storage)
        // Look for JSON files that match the platform pattern
        const metadataFile = files.find(
          (f) => f.name.endsWith(".json") && 
                 (f.name.includes(`aether-${platform}`) || f.name.includes(platform))
        );
        
        if (metadataFile) {
          try {
            const { data: metadataContent, error: metadataError } = await supabase.storage
              .from(storageBucket)
              .download(metadataFile.name);
            
            if (!metadataError && metadataContent) {
              const text = await metadataContent.text();
              const metadata = JSON.parse(text);
              
              if (metadata.url && metadata.storage === "external") {
                return {
                  platform,
                  url: metadata.url,
                  filename: metadata.filename,
                  version: metadata.version || extractVersion(metadata.filename) || "latest",
                  size: formatFileSize(metadata.size),
                  updatedAt: metadata.uploaded_at,
                };
              }
            }
          } catch (error) {
            // Fall through to regular file check
          }
        }
        
        // Fallback: check for regular installer file
        const installerFile = files.find(
          (f) => extensions.some(ext => f.name.endsWith(ext)) || f.name.includes(platform)
        );
        
        if (installerFile) {
          return {
            platform,
            url: `${storageBaseUrl}/${installerFile.name}`,
            filename: installerFile.name,
            version: extractVersion(installerFile.name) || "latest",
            size: formatFileSize(installerFile.metadata?.size),
            updatedAt: installerFile.created_at,
          };
        }
        
        return null;
      };

      // Find Windows installer
      const windowsLink = await getDownloadLink("windows", [".exe", ".zip"]);
      if (windowsLink) downloads.push(windowsLink);

      // Find macOS installer
      const macosLink = await getDownloadLink("macos", [".dmg", ".zip"]);
      if (macosLink) downloads.push(macosLink);

      // Find Linux installer
      const linuxLink = await getDownloadLink("linux", [".AppImage", ".zip"]);
      if (linuxLink) downloads.push(linuxLink);

      // If we found files in storage, use them; otherwise use defaults
      if (downloads.length > 0) {
        // Fill in missing platforms with defaults
        const platforms = new Set(downloads.map((d) => d.platform));
        defaultDownloads.forEach((def) => {
          if (!platforms.has(def.platform)) {
            downloads.push(def);
          }
        });

        return {
          version: downloads[0]?.version || "0.1.0",
          downloads: downloads.sort((a, b) => {
            const order = ["windows", "macos", "linux"];
            return order.indexOf(a.platform) - order.indexOf(b.platform);
          }),
        };
      }
    }
  } catch (error) {
    // Error logging handled by logger utility in production
    if (process.env.NODE_ENV === "development") {
      console.error("Error fetching downloads from storage:", error);
    }
    // Fall through to defaults
  }

  // Return default links
  return {
    version: "0.1.0",
    downloads: defaultDownloads,
  };
}

/**
 * Extract version number from filename
 */
function extractVersion(filename: string): string | null {
  const match = filename.match(/v?(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

/**
 * Format file size in bytes to human-readable string
 */
function formatFileSize(bytes?: number): string | undefined {
  if (!bytes) return undefined;
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
