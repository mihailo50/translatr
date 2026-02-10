/**
 * Avatar Upload Utility
 * Handles uploading user avatars to Supabase storage
 */

import { createClient } from "./supabase/client";
import { processFileForUpload } from "./fileSecurity";

const AVATAR_BUCKET = "avatars";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

/**
 * Validates an image file for avatar upload
 */
export function validateAvatarFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: "Invalid file type. Please upload a JPEG, PNG, or WebP image.",
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: "File size too large. Maximum size is 5MB.",
    };
  }

  return { valid: true };
}

/**
 * Uploads an avatar image to Supabase storage
 * @param file The image file to upload
 * @param userId The user ID (for file path)
 * @returns The public URL of the uploaded avatar or an error
 */
export async function uploadAvatar(
  file: File,
  userId: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    // Validate file
    const validation = validateAvatarFile(file);
    if (!validation.valid) {
      return { url: null, error: validation.error || "Invalid file" };
    }

    // Process file (strip metadata, compress)
    const { file: processedFile } = await processFileForUpload(file);

    // Validate processed file
    if (!processedFile || processedFile.size === 0) {
      return { url: null, error: "File processing failed. Please try a different image." };
    }

    // Create Supabase client
    const supabase = createClient();

    // Generate unique filename with proper extension
    const fileExt = processedFile.type?.split("/")[1] || processedFile.name.split(".").pop() || "jpg";
    const sanitizedExt = fileExt === "jpeg" ? "jpg" : fileExt;
    const fileName = `${userId}/${Date.now()}.${sanitizedExt}`;

    // Upload to storage with upsert enabled to handle existing files
    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(fileName, processedFile, {
        cacheControl: "3600",
        upsert: true, // Allow overwriting existing files
        contentType: processedFile.type || "image/jpeg",
      });

    if (error) {
      // Check if it's a permissions/bucket issue
      if (error.message.includes("Bucket not found") || error.message.includes("new row violates")) {
        return { url: null, error: "Storage bucket not configured. Please contact support." };
      }
      
      // If file already exists error, try with a unique name
      if (error.message.includes("already exists") || error.message.includes("409")) {
        const uniqueFileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { data: retryData, error: retryError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(uniqueFileName, processedFile, {
            cacheControl: "3600",
            upsert: true,
            contentType: processedFile.type || "image/jpeg",
          });

        if (retryError) {
          console.error("Avatar upload retry error:", retryError);
          return { url: null, error: retryError.message || "Failed to upload avatar. Please check storage permissions." };
        }

        const { data: urlData } = supabase.storage
          .from(AVATAR_BUCKET)
          .getPublicUrl(retryData.path);

        return { url: urlData.publicUrl, error: null };
      }

      console.error("Avatar upload error:", error);
      return { url: null, error: error.message || "Failed to upload avatar. Please check storage permissions." };
    }

    if (!data) {
      return { url: null, error: "Upload failed: No data returned" };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(data.path);

    return { url: urlData.publicUrl, error: null };
  } catch (error) {
    return {
      url: null,
      error: error instanceof Error ? error.message : "Failed to upload avatar",
    };
  }
}

/**
 * Deletes an old avatar from storage
 * @param avatarUrl The URL of the avatar to delete
 */
export async function deleteAvatar(avatarUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Extract path from URL
    const url = new URL(avatarUrl);
    const pathParts = url.pathname.split("/");
    const bucketIndex = pathParts.findIndex((part) => part === AVATAR_BUCKET);
    
    if (bucketIndex === -1 || bucketIndex === pathParts.length - 1) {
      return { success: false, error: "Invalid avatar URL" };
    }

    const filePath = pathParts.slice(bucketIndex + 1).join("/");

    const supabase = createClient();
    const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([filePath]);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete avatar",
    };
  }
}
