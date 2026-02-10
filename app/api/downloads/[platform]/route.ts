import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import fs from "fs";
import path from "path";

const PLATFORM_MAP: Record<string, { filename: string; contentType: string }> = {
  windows: {
    filename: "Aether-Setup.exe",
    contentType: "application/x-msdownload",
  },
  macos: {
    filename: "Aether.dmg",
    contentType: "application/x-apple-diskimage",
  },
  linux: {
    filename: "Aether.AppImage",
    contentType: "application/x-executable",
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;

  if (!platform || !PLATFORM_MAP[platform]) {
    return NextResponse.json(
      { error: "Invalid platform" },
      { status: 400 }
    );
  }

  const platformInfo = PLATFORM_MAP[platform];
  const supabase = await createClient();

  // Try to fetch from Supabase Storage first (check for metadata files for external storage)
  const storageBucket = process.env.NEXT_PUBLIC_DOWNLOADS_BUCKET || "downloads";

  try {
    const { data: files, error: listError } = await supabase.storage
      .from(storageBucket)
      .list("", {
        limit: 100,
      });

    if (!listError && files && files.length > 0) {
      // First, check for metadata file (external storage like Cloudflare R2)
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
              // Redirect to external storage URL (Cloudflare R2)
              return NextResponse.redirect(metadata.url);
            }
          }
        } catch (error) {
          // Fall through to regular file check
          if (process.env.NODE_ENV === "development") {
            console.error("Error reading metadata file:", error);
          }
        }
      }

      // Fallback: Check for regular installer files in Supabase Storage
      let targetFile: string | null = null;

      if (platform === "windows") {
        targetFile = files.find((f) => f.name.endsWith(".exe") || f.name.endsWith(".zip"))?.name || null;
      } else if (platform === "macos") {
        targetFile = files.find((f) => f.name.endsWith(".dmg") || f.name.endsWith(".zip"))?.name || null;
      } else if (platform === "linux") {
        targetFile = files.find((f) => f.name.endsWith(".AppImage") || f.name.endsWith(".zip"))?.name || null;
      }

      if (targetFile) {
        // Get public URL from Supabase Storage
        const { data } = supabase.storage
          .from(storageBucket)
          .getPublicUrl(targetFile);

        // Redirect to the public URL
        return NextResponse.redirect(data.publicUrl);
      }
    }
  } catch (error) {
    // Error logging handled by logger utility in production
    if (process.env.NODE_ENV === "development") {
      console.error("Error fetching from Supabase Storage:", error);
    }
    // Fall through to local file serving
  }

  // Fallback: Try to serve from local dist folder (for development/testing)
  const distPath = path.join(process.cwd(), "dist");
  
  // Build list of possible file paths based on platform
  let possiblePaths: string[] = [];
  
  if (platform === "windows") {
    // For Windows, look for any .exe file with "Aether" and "Setup" in the name
    if (fs.existsSync(distPath)) {
      const exeFiles = fs.readdirSync(distPath)
        .filter(f => f.endsWith(".exe") && f.includes("Aether") && f.includes("Setup"))
        .map(f => path.join(distPath, f));
      possiblePaths.push(...exeFiles);
    }
    // Also try common patterns
    possiblePaths.push(
      path.join(distPath, "Aether Setup 0.1.0.exe"),
      path.join(distPath, "Aether Setup.exe"),
      path.join(distPath, platformInfo.filename)
    );
  } else {
    // For other platforms, use standard patterns
    possiblePaths = [
      path.join(distPath, platformInfo.filename),
      path.join(distPath, `${platform}-${platformInfo.filename}`),
      path.join(distPath, `Aether-${platform}-${platformInfo.filename}`),
    ];
  }

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      const fileBuffer = fs.readFileSync(filePath);
      const stats = fs.statSync(filePath);

      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": platformInfo.contentType,
          "Content-Disposition": `attachment; filename="${platformInfo.filename}"`,
          "Content-Length": stats.size.toString(),
        },
      });
    }
  }

  // If file not found, return 404
  return NextResponse.json(
    {
      error: "Download not available",
      message: `The ${platform} version is not available yet. Please check back later.`,
    },
    { status: 404 }
  );
}
