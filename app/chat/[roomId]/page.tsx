import React from "react";
import { createClient } from "../../../utils/supabase/server";
import ChatRoom, { RoomDetails } from "../../../components/chat/ChatRoom";
import { redirect } from "next/navigation";

// Ensure this route is always dynamic (no static 404)
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getRoomDetails(roomId: string, currentUserId: string): Promise<RoomDetails> {
  const supabase = await createClient();

  // First, try to ensure current user is a member (this avoids RLS recursion)
  // The INSERT policy allows users to insert themselves, so this should work
  await supabase.from("room_members").insert({ room_id: roomId, profile_id: currentUserId });

  // Ignore duplicate key errors (user is already a member)
  // Non-duplicate errors are ignored silently

  // Now query members - user should be a member now, so RLS recursion should be avoided
  const { data: members, error: membersError } = await supabase
    .from("room_members")
    .select("profile_id")
    .eq("room_id", roomId);

  // Check if there's an actual error with meaningful properties
  if (membersError && typeof membersError === "object" && membersError !== null) {
    const hasMessage =
      "message" in membersError &&
      typeof membersError.message === "string" &&
      membersError.message.length > 0;
    const hasCode =
      "code" in membersError &&
      typeof membersError.code === "string" &&
      membersError.code.length > 0;

    // Check if it's the RLS recursion error
    const isRecursionError =
      membersError.code === "42P17" || membersError.message?.includes("infinite recursion");

    if (isRecursionError) {
      // RLS recursion error - this means the SELECT policy is broken
      // Try to work around it by using a simpler query or returning basic structure

      // Try to fetch participant info directly from profiles table using room ID pattern
      // For direct rooms, the room ID format is: direct_user1_user2
      if (roomId.startsWith("direct_")) {
        const parts = roomId.replace("direct_", "").split("_");
        if (parts.length >= 2) {
          const otherUserId = parts.find((id) => id !== currentUserId) || parts[1];
          const { data: otherProfile } = await supabase
            .from("profiles")
            .select("id, display_name, email, avatar_url")
            .eq("id", otherUserId)
            .single();

          if (otherProfile) {
            return {
              id: roomId,
              room_type: "direct",
              name: otherProfile.display_name || otherProfile.email?.split("@")[0] || "Unknown",
              members_count: 2,
              participants: [
                {
                  id: otherProfile.id,
                  name: otherProfile.display_name || otherProfile.email?.split("@")[0] || "Unknown",
                  avatar:
                    otherProfile.avatar_url ||
                    `https://picsum.photos/seed/${otherProfile.id}/50/50`,
                  status: "offline",
                },
              ],
            };
          }
        }
      }

      // Fallback if we can't extract participant info
      return {
        id: roomId,
        room_type: "direct",
        name: "Unknown",
        members_count: 0,
        participants: [],
      };
    }

    // For other errors, return basic structure
    if (hasMessage || hasCode) {
      return {
        id: roomId,
        room_type: "direct",
        name: "Unknown",
        members_count: 0,
        participants: [],
      };
    }
  }

  if (!members || members.length === 0) {
    // Room exists but current user isn't a member yet (common when second user opens the room)
    // Try to add current user as a member - RLS allows users to insert themselves
    const { error: insertError } = await supabase
      .from("room_members")
      .insert({ room_id: roomId, profile_id: currentUserId })
      .select("profile_id")
      .single();

    if (insertError) {
      // If insert failed (not a duplicate), return basic structure
      // Even if insert failed, return basic structure so chat can still load
      return {
        id: roomId,
        room_type: "direct",
        name: "Unknown",
        members_count: 0,
        participants: [],
      };
    }

    // If insert succeeded, query again to get all members
    const { data: updatedMembers, error: queryError } = await supabase
      .from("room_members")
      .select("profile_id")
      .eq("room_id", roomId);

    if (queryError) {
      return {
        id: roomId,
        room_type: "direct",
        name: "Unknown",
        members_count: 1,
        participants: [],
      };
    }

    // Use the updated members list
    if (updatedMembers && updatedMembers.length > 0) {
      // Continue with the rest of the logic using updatedMembers
      const memberIds = updatedMembers.map((m) => m.profile_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, email, avatar_url")
        .in("id", memberIds);

      if (profiles && profiles.length > 0) {
        const otherProfile = profiles.find((p) => p.id !== currentUserId);
        if (otherProfile) {
          return {
            id: roomId,
            room_type: "direct",
            name: otherProfile.display_name || otherProfile.email?.split("@")[0] || "Unknown",
            members_count: updatedMembers.length,
            participants: [
              {
                id: otherProfile.id,
                name: otherProfile.display_name || otherProfile.email?.split("@")[0] || "Unknown",
                avatar:
                  otherProfile.avatar_url || `https://picsum.photos/seed/${otherProfile.id}/50/50`,
                status: "offline" as const,
              },
            ],
          };
        }
      }
    }

    // Fallback if we still don't have members
    return {
      id: roomId,
      room_type: "direct",
      name: "Unknown",
      members_count: 0,
      participants: [],
    };
  }

  // Fetch profile details for all members
  const memberIds = members.map((m) => m.profile_id);
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name, email, avatar_url")
    .in("id", memberIds);

  if (profilesError) {
    // Return basic structure with member count
    return {
      id: roomId,
      room_type: members.length === 2 ? "direct" : "group",
      name: "Unknown",
      members_count: members.length,
      participants: [],
    };
  }

  // Determine if it's a direct message (2 members) or group chat
  const isDirect = members.length === 2;

  // Get the other participant for direct messages
  const otherMemberId = members.find((m) => m.profile_id !== currentUserId)?.profile_id;
  const otherProfile = profiles?.find((p) => p.id === otherMemberId);

  if (isDirect && otherProfile) {
    return {
      id: roomId,
      room_type: "direct",
      name: otherProfile.display_name || otherProfile.email?.split("@")[0] || "Unknown",
      members_count: 2,
      participants: [
        {
          id: otherProfile.id,
          name: otherProfile.display_name || otherProfile.email?.split("@")[0] || "Unknown",
          avatar: otherProfile.avatar_url || `https://picsum.photos/seed/${otherProfile.id}/50/50`,
          status: "offline", // Status will be updated by presence system
        },
      ],
    };
  }

  // Group chat - include ALL participants (including current user) for accurate online counts
  const participants = (profiles || []).map((profile) => ({
    id: profile.id,
    name: profile.display_name || profile.email?.split("@")[0] || "Unknown",
    avatar: profile.avatar_url || `https://picsum.photos/seed/${profile.id}/50/50`,
    status: "offline" as const,
  }));

  // For display name, use other participants (not current user)
  const otherParticipants = participants.filter((p) => p.id !== currentUserId);
  const displayName =
    otherParticipants
      .map((p) => p.name)
      .slice(0, 2)
      .join(", ") + (otherParticipants.length > 2 ? ` +${otherParticipants.length - 2}` : "");

  return {
    id: roomId,
    room_type: "group",
    name: displayName,
    members_count: members.length,
    participants, // All participants including current user
  };
}

export default async function ChatRoomPage({
  params,
}: {
  params: { roomId: string } | Promise<{ roomId: string }>;
}) {
  // Turbopack/Next 16 may pass params as a Promise; handle both sync and async
  const resolvedParams =
    params && typeof params === "object" && "then" in params
      ? await (params as Promise<{ roomId: string }>)
      : (params as { roomId: string });
  const roomId = resolvedParams?.roomId;

  if (!roomId) {
    // If roomId is missing, redirect to chats list or home
    redirect("/chat");
  }

  // Auth check is handled by middleware.ts at the edge
  // If we reach here, user is authenticated
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // User should always exist here due to middleware, but add safety check for TypeScript
  if (!user) {
    redirect("/auth/login");
  }

  // Fetch profile and room details in parallel for faster loading
  const [profileResult, roomDetailsResult] = await Promise.allSettled([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getRoomDetails(roomId, user.id),
  ]);

  const profile = profileResult.status === "fulfilled" ? profileResult.value.data : null;
  const roomDetails =
    roomDetailsResult.status === "fulfilled"
      ? roomDetailsResult.value
      : {
          id: roomId,
          room_type: "direct" as const,
          name: "Loading...",
          members_count: 0,
          participants: [],
        };

  return (
    <div className="h-full w-full">
      <ChatRoom
        roomId={roomId}
        roomDetails={roomDetails}
        userId={user.id}
        userName={profile?.display_name || user.email?.split("@")[0] || "Unknown"}
        userPreferredLanguage={profile?.preferred_language || "en"}
      />
    </div>
  );
}
