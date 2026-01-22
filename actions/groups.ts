"use server";

import { createClient } from "../utils/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

export interface CreateGroupResult {
  success: boolean;
  roomId?: string;
  error?: string;
}

export async function createGroupRoom(
  name: string,
  memberIds: string[]
): Promise<CreateGroupResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Validate inputs
  if (!name || name.trim().length === 0) {
    return { success: false, error: "Group name is required" };
  }

  if (name.trim().length > 100) {
    return { success: false, error: "Group name must be 100 characters or less" };
  }

  if (!memberIds || memberIds.length === 0) {
    return { success: false, error: "At least one member must be selected" };
  }

  if (memberIds.length > 10) {
    return { success: false, error: "Maximum 10 members allowed" };
  }

  // Ensure creator is not in memberIds (we'll add them separately)
  const uniqueMemberIds = Array.from(new Set(memberIds.filter((id) => id !== user.id)));

  // Generate a unique room ID for the group
  const roomId = `group_${randomUUID()}`;

  try {
    // Use service role client to bypass RLS for group creation
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!supabaseServiceKey || !supabaseUrl) {
      return {
        success: false,
        error: "Server configuration error",
      };
    }

    const serviceSupabase = createSupabaseClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Insert all room members (creator + selected members)
    const allMemberIds = [user.id, ...uniqueMemberIds];
    const roomMembers = allMemberIds.map((profileId) => ({
      room_id: roomId,
      profile_id: profileId,
    }));

    const { error: insertError } = await serviceSupabase.from("room_members").insert(roomMembers);

    if (insertError) {
      return {
        success: false,
        error: insertError.message || "Failed to create group room",
      };
    }

    // Optionally, you could create a "rooms" table entry here if you have one
    // For now, the room is identified by its room_id in room_members

    // Revalidate relevant paths
    revalidatePath("/");
    revalidatePath("/contacts");

    return {
      success: true,
      roomId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}
