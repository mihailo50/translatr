"use server";

import { createClient } from "../utils/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

export type ContactPresenceStatus = "online" | "busy" | "dnd" | "invisible" | "in-call" | "offline";

export interface ContactUser {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  status?: "friends" | "pending_sent" | "pending_received" | "none";
  // Stored presence from profile as a fallback when realtime presence isn't available
  profile_status?: ContactPresenceStatus;
  relationship_id?: string;
}

export async function getContactsData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { friends: [], requests: [] };

  const { data, error } = await supabase
    .from("contacts")
    .select(
      `
      id,
      status,
      created_at,
      user_id,
      contact_id,
      sender:profiles!contacts_user_id_fkey(id, display_name, email, avatar_url, status),
      receiver:profiles!contacts_contact_id_fkey(id, display_name, email, avatar_url, status)
    `
    )
    .or(`user_id.eq.${user.id},contact_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return { friends: [], requests: [] };
  }

  const friends: ContactUser[] = [];
  const requests: ContactUser[] = [];

  for (const row of data) {
    const isSender = row.user_id === user.id;
    const otherUserRaw = isSender ? row.receiver : row.sender;
    if (!otherUserRaw) continue;

    // Handle case where Supabase returns array (shouldn't happen but TypeScript thinks it might)
    const otherUser = Array.isArray(otherUserRaw) ? otherUserRaw[0] : otherUserRaw;
    if (!otherUser) continue;

    const contactProfile: ContactUser = {
      id: otherUser.id,
      display_name: otherUser.display_name,
      email: otherUser.email,
      avatar_url: otherUser.avatar_url,
      profile_status: otherUser.status,
      relationship_id: row.id,
    };

    if (row.status === "accepted") {
      friends.push({ ...contactProfile, status: "friends" });
    } else if (row.status === "pending") {
      if (!isSender) {
        requests.push({ ...contactProfile, status: "pending_received" });
      }
    }
  }

  return { friends, requests };
}

export async function searchUsers(query: string): Promise<ContactUser[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  if (!query || query.length < 2) return [];

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, display_name, email, avatar_url")
    .or(`display_name.ilike.%${query}%,email.ilike.%${query}%`)
    .neq("id", user.id)
    .limit(20);

  if (error) {
    return [];
  }

  const { data: myContacts } = await supabase
    .from("contacts")
    .select("user_id, contact_id, status, id")
    .or(`user_id.eq.${user.id},contact_id.eq.${user.id}`);

  const results = profiles.map(
    (profile: {
      id: string;
      display_name: string | null;
      email: string | null;
      avatar_url: string | null;
    }) => {
      const relationship = myContacts?.find(
        (c: { user_id: string; contact_id: string; status: string; id: string }) =>
          (c.user_id === user.id && c.contact_id === profile.id) ||
          (c.contact_id === user.id && c.user_id === profile.id)
      );

      let status: ContactUser["status"] = "none";
      let relationship_id = undefined;

      if (relationship) {
        relationship_id = relationship.id;
        if (relationship.status === "accepted") {
          status = "friends";
        } else if (relationship.status === "pending") {
          status = relationship.user_id === user.id ? "pending_sent" : "pending_received";
        } else if (relationship.status === "blocked") {
          status = "none";
        }
      }

      return {
        id: profile.id,
        display_name: profile.display_name,
        email: profile.email,
        avatar_url: profile.avatar_url,
        status,
        relationship_id,
      };
    }
  );

  return results;
}

export async function sendContactRequest(targetUserId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: existing } = await supabase
    .from("contacts")
    .select("*")
    .or(
      `and(user_id.eq.${user.id},contact_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},contact_id.eq.${user.id})`
    )
    .single();

  if (existing) {
    if (existing.status === "pending" && existing.contact_id === user.id) {
      return await acceptContactRequest(existing.id);
    }
    return { error: "Relationship already exists" };
  }

  const { error } = await supabase.from("contacts").insert({
    user_id: user.id,
    contact_id: targetUserId,
    status: "pending",
  });

  if (error) return { error: error.message };

  // Create notification for the recipient
  try {
    // Get sender's profile info for the notification
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .single();

    // Use service role to create notification (bypasses RLS)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseServiceKey && supabaseServiceKey !== "placeholder-key") {
      const supabaseService = createSupabaseClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      await supabaseService.from("notifications").insert({
        recipient_id: targetUserId,
        type: "contact_request",
        content: {
          sender_name: senderProfile?.display_name || "Someone",
          preview: "wants to connect with you",
          avatar_url: senderProfile?.avatar_url || undefined,
        },
        related_id: user.id, // Store sender ID in related_id for easy reference
      });
    }
  } catch (_notifError) {
    // Don't fail contact request if notification creation fails
  }

  try {
    revalidatePath("/contacts");
  } catch (_e) {
    // Ignore revalidation errors
  }
  return { success: true };
}

export async function acceptContactRequest(relationshipId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ status: "accepted" })
    .eq("id", relationshipId);

  if (error) return { error: error.message };
  try {
    revalidatePath("/contacts");
  } catch (_e) {
    // Ignore revalidation errors
  }
  return { success: true };
}

export async function declineContactRequest(relationshipId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", relationshipId);

  if (error) return { error: error.message };
  try {
    revalidatePath("/contacts");
  } catch (_e) {
    // Ignore revalidation errors
  }
  return { success: true };
}

// Check if blocking exists between current user and the other room member
export async function getBlockStatus(roomId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { blocked: false, blockedByMe: false };

  // Get other member
  const { data: members } = await supabase
    .from("room_members")
    .select("profile_id")
    .eq("room_id", roomId)
    .neq("profile_id", user.id)
    .limit(1);

  if (!members || members.length === 0) return { blocked: false, blockedByMe: false };
  const targetId = members[0].profile_id;

  const { data: rel } = await supabase
    .from("contacts")
    .select("id, status, user_id")
    .or(
      `and(user_id.eq.${user.id},contact_id.eq.${targetId}),and(user_id.eq.${targetId},contact_id.eq.${user.id})`
    )
    .single();

  if (!rel || rel.status !== "blocked") return { blocked: false, blockedByMe: false };

  return { blocked: true, blockedByMe: rel.user_id === user.id };
}

export async function blockUserInRoom(roomId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // 1. Get room members to find target
  const { data: members, error: membersError } = await supabase
    .from("room_members")
    .select("profile_id")
    .eq("room_id", roomId)
    .neq("profile_id", user.id)
    .limit(1);

  if (membersError || !members || members.length === 0) {
    return { error: "Could not find user to block" };
  }

  const targetUserId = members[0].profile_id;

  // 2. Check/Update relationship
  const { data: existingRel } = await supabase
    .from("contacts")
    .select("id")
    .or(
      `and(user_id.eq.${user.id},contact_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},contact_id.eq.${user.id})`
    )
    .single();

  if (existingRel) {
    // Update existing to blocked. IMPORTANT: Set user_id to current user to indicate ownership of the block.
    const { error } = await supabase
      .from("contacts")
      .update({ status: "blocked", user_id: user.id, contact_id: targetUserId })
      .eq("id", existingRel.id);

    if (error) return { error: error.message };
  } else {
    // Create new blocked relationship
    const { error } = await supabase.from("contacts").insert({
      user_id: user.id,
      contact_id: targetUserId,
      status: "blocked",
    });
    if (error) return { error: error.message };
  }

  return { success: true };
}

export async function unblockUserInRoom(roomId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: members } = await supabase
    .from("room_members")
    .select("profile_id")
    .eq("room_id", roomId)
    .neq("profile_id", user.id)
    .limit(1);

  if (!members || members.length === 0) return { error: "User not found" };
  const targetUserId = members[0].profile_id;

  // Find the blocked relationship where I am the user_id (blocker)
  const { data: rel } = await supabase
    .from("contacts")
    .select("id")
    .eq("user_id", user.id)
    .eq("contact_id", targetUserId)
    .eq("status", "blocked")
    .single();

  if (rel) {
    // Delete the block (reset to no relationship)
    const { error } = await supabase.from("contacts").delete().eq("id", rel.id);

    if (error) return { error: error.message };
    return { success: true };
  }

  return { error: "Block record not found or permission denied" };
}

// Get or create a direct message room between two users
export async function getOrCreateDirectRoom(targetUserId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Check if users are friends (contact status is accepted)
  const { data: contact } = await supabase
    .from("contacts")
    .select("status")
    .or(
      `and(user_id.eq.${user.id},contact_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},contact_id.eq.${user.id})`
    )
    .single();

  if (!contact || contact.status !== "accepted") {
    return { error: "You can only message accepted contacts" };
  }

  // Create deterministic room ID for direct messages (sorted user IDs)
  const userIds = [user.id, targetUserId].sort();
  const roomId = `direct_${userIds[0]}_${userIds[1]}`;

  // Insert current user as a room member
  // The INSERT policy allows users to insert themselves
  const { error: userError } = await supabase
    .from("room_members")
    .insert({ room_id: roomId, profile_id: user.id });

  // If error is not a unique constraint violation, return it
  if (
    userError &&
    !userError.message?.includes("duplicate") &&
    !userError.code?.includes("23505")
  ) {
    return { error: userError.message };
  }

  // Note: We can only insert the current user due to RLS (users can only insert themselves)
  // The target user will need to be added when they first access the room or send a message
  // This is handled by ensuring they're added when they open the chat page

  return { success: true, roomId };
}
