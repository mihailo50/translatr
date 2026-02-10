"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../utils/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Get current user profile
 */
export async function getProfile() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { user: null, profile: null };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return { user, profile: null };
    }

    return {
      user: {
        id: user.id,
        email: user.email || "",
      },
      profile: profile || null,
    };
  } catch (_error) {
    return { user: null, profile: null };
  }
}

/**
 * Sign out the current user
 */
export async function signOutAction() {
  try {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to sign out" };
  }
}

/**
 * Upload avatar image to Supabase storage
 */
export async function uploadAvatar(formData: FormData) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: "Unauthorized" };
    }

    const file = formData.get("avatar") as File;
    if (!file) {
      return { success: false, error: "No file provided" };
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return { success: false, error: "File must be an image" };
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return { success: false, error: "Image size must be less than 5MB" };
    }

    // Generate unique filename
    const fileExt = file.name.split(".").pop();
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(fileName, file, {
        cacheControl: "3600",
        upsert: true, // Replace existing avatar
      });

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(fileName);

    // Update profile with new avatar URL
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        avatar_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    revalidatePath("/settings");
    revalidatePath("/", "layout");
    return { success: true, avatarUrl: publicUrl, url: publicUrl };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to upload avatar",
    };
  }
}

/**
 * Update user profile
 */
export async function updateProfile(formData: FormData) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: "Unauthorized" };
    }

    const displayName = formData.get("display_name") as string;
    const bio = formData.get("bio") as string;
    const preferredLanguage = formData.get("preferred_language") as string;
    const theme = formData.get("theme") as "aurora" | "midnight";
    const avatarUrl = formData.get("avatar_url") as string | null;

    const updateData: {
      display_name?: string | null;
      bio?: string | null;
      preferred_language?: string;
      theme?: "aurora" | "midnight";
      avatar_url?: string | null;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (displayName !== null) updateData.display_name = displayName || null;
    if (bio !== null) updateData.bio = bio || null;
    if (preferredLanguage) updateData.preferred_language = preferredLanguage;
    if (theme) updateData.theme = theme;
    if (avatarUrl !== null) updateData.avatar_url = avatarUrl || null;

    const { error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/settings");
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update profile",
    };
  }
}

/**
 * Upload avatar and update profile
 */
export async function uploadAvatarAction(formData: FormData) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: "Unauthorized" };
    }

    const avatarUrl = formData.get("avatar_url") as string;

    if (!avatarUrl) {
      return { success: false, error: "Avatar URL is required" };
    }

    // Get current profile to delete old avatar
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .single();

    // Update profile with new avatar URL
    const { error } = await supabase
      .from("profiles")
      .update({
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    // Note: Old avatar deletion should be handled client-side after successful upload
    // to avoid blocking the update if deletion fails

    revalidatePath("/settings");
    revalidatePath("/", "layout");
    return { success: true, avatarUrl };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to upload avatar",
    };
  }
}

/**
 * Update user subscription plan
 */
export async function updateSubscription(plan: "free" | "pro") {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: "Unauthorized" };
    }

    const updateData: {
      plan: "free" | "pro";
      updated_at: string;
      subscription_end_date?: string | null;
    } = {
      plan: plan,
      updated_at: new Date().toISOString(),
    };

    // If downgrading to free, clear subscription end date
    if (plan === "free") {
      updateData.subscription_end_date = null;
    } else if (plan === "pro") {
      // If upgrading to pro, set subscription end date to 1 year from now
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1);
      updateData.subscription_end_date = endDate.toISOString();
    }

    const { error } = await supabase.from("profiles").update(updateData).eq("id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update subscription",
    };
  }
}

/**
 * Manually trigger notification cleanup (for testing or manual cleanup)
 * @internal - Exported for potential manual use, but not used in codebase
 */
export async function cleanupOldNotifications(): Promise<{
  success: boolean;
  deletedCount?: number;
  error?: string;
}> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || supabaseUrl === "https://placeholder.supabase.co") {
      return { success: false, error: "Server configuration error" };
    }

    if (!supabaseServiceKey || supabaseServiceKey === "placeholder-key") {
      return { success: false, error: "Server configuration error" };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call the cleanup function
    const { data, error } = await supabase.rpc("cleanup_old_notifications");

    if (error) {
      return { success: false, error: error.message };
    }

    const deletedCount = data || 0;

    return {
      success: true,
      deletedCount,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to cleanup notifications",
    };
  }
}
