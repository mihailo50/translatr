import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "fs/promises";
import path from "path";

/**
 * Server-side API route for uploading installers
 * Uses service role key for admin access
 * 
 * POST /api/admin/upload-installer
 * Body: { platform: 'windows' | 'macos' | 'linux', filePath: string, version?: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Get service role key from environment (server-side only)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Server configuration missing" },
        { status: 500 }
      );
    }

    // Create admin client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body = await request.json();
    const { platform, filePath, version = "0.1.0" } = body;

    if (!platform || !filePath) {
      return NextResponse.json(
        { error: "Missing platform or filePath" },
        { status: 400 }
      );
    }

    const bucketName = process.env.NEXT_PUBLIC_DOWNLOADS_BUCKET || "downloads";

    // Read file from dist directory
    const fullPath = path.join(process.cwd(), filePath);
    const fileBuffer = await readFile(fullPath);
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName);
    const uploadName = `aether-${platform}-${version}${ext}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(uploadName, fileBuffer, {
        contentType: getContentType(ext),
        upsert: true,
      });

    if (error) {
      console.error("Upload error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(uploadName);

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      filename: uploadName,
    });
  } catch (error) {
    console.error("Upload failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

function getContentType(ext: string): string {
  const types: Record<string, string> = {
    ".exe": "application/x-msdownload",
    ".dmg": "application/x-apple-diskimage",
    ".AppImage": "application/x-executable",
  };
  return types[ext] || "application/octet-stream";
}
