"use server";

import { createClient } from "../../utils/supabase/server";
import { Conversation } from "./home";

export async function getPinnedChats(): Promise<Conversation[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  // Fetch user's quantumlinks (pinned chats) ordered by position
  const { data: quantumlinks, error: quantumlinksError } = await supabase
    .from("quantumlinks")
    .select("room_id, position, label")
    .eq("user_id", user.id)
    .not("room_id", "is", null)
    .order("position", { ascending: true });

  if (quantumlinksError || !quantumlinks || quantumlinks.length === 0) {
    return [];
  }

  const roomIds = quantumlinks.map((ql) => ql.room_id).filter((id): id is string => id !== null);

  if (roomIds.length === 0) {
    return [];
  }

  // Use service role to bypass RLS for reliable data access
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || supabaseUrl === "https://placeholder.supabase.co" || !supabaseServiceKey || supabaseServiceKey === "placeholder-key") {
    return [];
  }

  const { createClient: createServiceClient } = await import("@supabase/supabase-js");
  const serviceSupabase = createServiceClient(supabaseUrl, supabaseServiceKey);

  // Get room members for all pinned rooms
  const { data: roomMembers } = await serviceSupabase
    .from("room_members")
    .select("room_id, profile_id")
    .in("room_id", roomIds);

  // Type for messages with sender profile
  type MessageWithSender = {
    id: string;
    room_id: string;
    original_text: string;
    created_at: string;
    sender_id: string;
    metadata: unknown;
    sender: {
      id: string;
      display_name: string | null;
      avatar_url: string | null;
      email: string | null;
    } | {
      id: string;
      display_name: string | null;
      avatar_url: string | null;
      email: string | null;
    }[] | null;
  };

  // Get last message for each pinned room
  const { data: lastMessages } = await serviceSupabase
    .from("messages")
    .select(
      `
      id,
      room_id,
      original_text,
      created_at,
      sender_id,
      metadata,
      sender:profiles!messages_sender_id_fkey(id, display_name, avatar_url, email)
    `
    )
    .in("room_id", roomIds)
    .order("created_at", { ascending: false });

  // Get all profiles for avatar/name resolution
  const allProfileIds = new Set<string>();
  if (roomMembers) {
    roomMembers.forEach((rm) => allProfileIds.add(rm.profile_id));
  }
  if (lastMessages) {
    (lastMessages as unknown as MessageWithSender[]).forEach((msg) => {
      if (msg.sender_id) allProfileIds.add(msg.sender_id);
      if (msg.sender) {
        const sender = Array.isArray(msg.sender) ? msg.sender[0] : msg.sender;
        if (sender?.id) {
          allProfileIds.add(sender.id);
        }
      }
    });
  }

  const { data: profiles } = await serviceSupabase
    .from("profiles")
    .select("id, display_name, avatar_url, email")
    .in("id", Array.from(allProfileIds));

  const profilesMap = new Map(
    profiles?.map((p) => [p.id, p]) || []
  );

  // Build last message map
  const lastMessageMap = new Map<string, MessageWithSender>();
  if (lastMessages) {
    for (const msg of lastMessages as unknown as MessageWithSender[]) {
      if (msg && !lastMessageMap.has(msg.room_id)) {
        lastMessageMap.set(msg.room_id, msg);
      }
    }
  }

  // Build room members map
  const roomMembersMap = new Map<string, string[]>();
  if (roomMembers) {
    for (const rm of roomMembers) {
      if (!roomMembersMap.has(rm.room_id)) {
        roomMembersMap.set(rm.room_id, []);
      }
      roomMembersMap.get(rm.room_id)?.push(rm.profile_id);
    }
  }

  // Build conversations from quantumlinks, maintaining order
  const pinnedConversations: Conversation[] = [];

  for (const ql of quantumlinks) {
    if (!ql.room_id) continue;

    const roomId = ql.room_id;
    const members = roomMembersMap.get(roomId) || [];
    const lastMessage = lastMessageMap.get(roomId);

    // Determine if it's a group or direct message
    const isGroup = !roomId.startsWith("direct_") && members.length > 2;

    // Get room name and avatar
    let roomName = ql.label || "Unknown";
    let roomAvatar: string | null = null;

    if (isGroup) {
      // For groups, use the first few member names or a default
      const memberNames = members
        .slice(0, 3)
        .map((id) => {
          const profile = profilesMap.get(id);
          return profile?.display_name || profile?.email?.split("@")[0] || "Unknown";
        });
      roomName = ql.label || memberNames.join(", ") || "Group Chat";
      roomAvatar = null; // Groups don't have avatars yet
    } else {
      // For direct messages, find the other user
      const otherUserId = members.find((id) => id !== user.id);
      if (otherUserId) {
        const otherProfile = profilesMap.get(otherUserId);
        roomName = ql.label || otherProfile?.display_name || otherProfile?.email?.split("@")[0] || "Unknown";
        roomAvatar = otherProfile?.avatar_url || null;
      }
    }

    // Get last message text
    let lastMessageText = "No messages yet";
    let lastMessageTime = "";

    if (lastMessage) {
      const metadata = lastMessage.metadata as { encrypted?: boolean; iv?: string } | null;
      if (metadata?.encrypted && metadata.iv) {
        // For encrypted messages, show encrypted indicator
        lastMessageText = "🔒 Encrypted message";
      } else {
        lastMessageText = (lastMessage.original_text as string) || "No messages yet";
      }

      const messageDate = new Date(lastMessage.created_at);
      const now = new Date();
      const diffMs = now.getTime() - messageDate.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) {
        lastMessageTime = "now";
      } else if (diffMins < 60) {
        lastMessageTime = `${diffMins}m`;
      } else if (diffHours < 24) {
        lastMessageTime = `${diffHours}h`;
      } else if (diffDays < 7) {
        lastMessageTime = `${diffDays}d`;
      } else {
        lastMessageTime = messageDate.toLocaleDateString();
      }
    }

    pinnedConversations.push({
      id: roomId,
      name: roomName,
      type: isGroup ? "group" : "direct",
      lastMessage: lastMessageText,
      time: lastMessageTime,
      avatar: roomAvatar || null,
      unread: 0, // Unread tracking can be added later
    });
  }

  return pinnedConversations;
}

export async function pinChat(roomId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // Check if already pinned
  const { data: existing } = await supabase
    .from("quantumlinks")
    .select("id")
    .eq("user_id", user.id)
    .eq("room_id", roomId)
    .single();

  if (existing) {
    return { success: false, error: "Chat is already pinned" };
  }

  // Get the next position for this user
  const { data: positionData } = await supabase.rpc("get_next_quantumlink_position", {
    p_user_id: user.id,
  });

  const position = positionData ?? 0;

  // Insert the quantumlink
  const { error } = await supabase.from("quantumlinks").insert({
    user_id: user.id,
    room_id: roomId,
    position: position,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function unpinChat(roomId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // Delete the quantumlink
  const { error } = await supabase
    .from("quantumlinks")
    .delete()
    .eq("user_id", user.id)
    .eq("room_id", roomId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
