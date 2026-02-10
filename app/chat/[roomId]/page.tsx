"use client";

import React, { useState, useEffect, use } from "react";
import { createClient } from "../../../utils/supabase/client";
import ChatRoom, { RoomDetails } from "../../../components/chat/ChatRoom";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/components/contexts/AuthContext";
import { checkChannelPermission } from "@/actions/spaces";
import { ShieldX, Lock } from "lucide-react";

export default function ChatRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { user } = useAuth();
  const [roomDetails, setRoomDetails] = useState<RoomDetails | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const { roomId } = use(params);

  useEffect(() => {
    if (!user) return;

    const getRoomDetails = async (roomId: string, currentUserId: string): Promise<RoomDetails> => {
      const supabase = createClient();
      
      // Check if user is already a member first
      const { data: existingMember } = await supabase
        .from("room_members")
        .select("profile_id")
        .eq("room_id", roomId)
        .eq("profile_id", currentUserId)
        .maybeSingle();

      // Only insert if user is not already a member (RLS only allows INSERT, not UPDATE)
      if (!existingMember) {
        const { error: insertError } = await supabase
          .from("room_members")
          .insert({ room_id: roomId, profile_id: currentUserId });
        
        // Silently ignore 409 conflict or other errors - user might have been added concurrently
        // Non-conflict errors are ignored to allow the page to continue loading
      }

      const { data: members, error: membersError } = await supabase
        .from("room_members")
        .select("profile_id")
        .eq("room_id", roomId);

      if (membersError) {
        return {
          id: roomId,
          room_type: "direct",
          name: "Unknown",
          members_count: 0,
          participants: [],
        };
      }

      if (!members || members.length === 0) {
        return {
          id: roomId,
          room_type: "direct",
          name: "Unknown",
          members_count: 0,
          participants: [],
        };
      }

      const memberIds = members.map((m) => m.profile_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name, email, avatar_url")
        .in("id", memberIds);

      if (profilesError) {
        return {
          id: roomId,
          room_type: members.length === 2 ? "direct" : "group",
          name: "Unknown",
          members_count: members.length,
          participants: [],
        };
      }

      const isDirect = members.length === 2;
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
              avatar: otherProfile.avatar_url || null,
              status: "offline",
            },
          ],
        };
      }

      const participants = (profiles || []).map((profile) => ({
        id: profile.id,
        name: profile.display_name || profile.email?.split("@")[0] || "Unknown",
        avatar: profile.avatar_url || null,
        status: "offline" as const,
      }));

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
        participants,
      };
    };

    const fetchData = async () => {
      console.log("🟦 [CHAT PAGE] fetchData called", {
        roomId,
        userId: user.id,
        timestamp: new Date().toISOString(),
      });
      
      setLoading(true);
      const supabase = createClient();
      
      // Check if this is a channel (check if room has space_id and room_type is "channel")
      console.log("🟦 [CHAT PAGE] Checking if room exists and is a channel...");
      const { data: roomData, error: roomDataError } = await supabase
        .from("rooms")
        .select("space_id, room_type")
        .eq("id", roomId)
        .maybeSingle();
      
      console.log("🟦 [CHAT PAGE] Room data query result:", {
        roomData,
        roomDataError,
        hasRoomData: !!roomData,
      });
      
      // Check if this is actually a channel (must have room_type="channel" AND space_id)
      // If room doesn't exist or doesn't have these properties, it's a regular chat
      const isChannel = roomData?.room_type === "channel" && roomData?.space_id;
      console.log("🟦 [CHAT PAGE] Room type check:", {
        isChannel,
        roomType: roomData?.room_type,
        hasSpaceId: !!roomData?.space_id,
        spaceId: roomData?.space_id,
      });
      
      // ONLY check channel permissions if it's actually a channel
      // Regular chats (direct/group) don't need channel permission checks - allow access immediately
      if (isChannel) {
        console.log("🟦 [CHAT PAGE] This is a channel, checking permissions...");
        const { hasAccess, error } = await checkChannelPermission(roomId, user.id);
        console.log("🟦 [CHAT PAGE] Permission check result:", {
          hasAccess,
          error,
        });
        setHasPermission(hasAccess);
        setPermissionError(error);
        
        if (!hasAccess) {
          console.log("🟦 [CHAT PAGE] Access denied, stopping load");
          setLoading(false);
          return;
        }
      } else {
        // Regular chat (direct or group) - allow access without channel permission checks
        // Room might not exist in rooms table, that's fine for regular chats
        console.log("🟦 [CHAT PAGE] Not a channel (regular chat), allowing access");
        setHasPermission(true);
      }
      
      console.log("🟦 [CHAT PAGE] Fetching profile and room details...");
      const [profileResult, roomDetailsResult] = await Promise.allSettled([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        getRoomDetails(roomId, user.id),
      ]);

      console.log("🟦 [CHAT PAGE] Profile and room details fetched:", {
        profileStatus: profileResult.status,
        roomDetailsStatus: roomDetailsResult.status,
        roomDetails: roomDetailsResult.status === "fulfilled" ? roomDetailsResult.value : null,
      });

      if (profileResult.status === "fulfilled") {
        setProfile(profileResult.value.data);
        console.log("🟦 [CHAT PAGE] Profile set");
      } else {
        console.log("🟦 [CHAT PAGE] Profile fetch failed:", profileResult.reason);
      }

      if (roomDetailsResult.status === "fulfilled") {
        setRoomDetails(roomDetailsResult.value);
        console.log("🟦 [CHAT PAGE] Room details set:", roomDetailsResult.value);
      } else {
        console.log("🟦 [CHAT PAGE] Room details fetch failed:", roomDetailsResult.reason);
        setRoomDetails({
          id: roomId,
          room_type: "direct" as const,
          name: "Loading...",
          members_count: 0,
          participants: [],
        });
      }
      setLoading(false);
      console.log("🟦 [CHAT PAGE] fetchData completed, loading set to false");
    };

    fetchData();
  }, [roomId, user]);

  return (
    <ProtectedRoute>
      <div className="h-full w-full">
        {loading || !roomDetails || !user ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-white/60">Loading...</div>
          </div>
        ) : hasPermission === false ? (
          <div className="h-full flex items-center justify-center bg-[#020205]">
            <div className="aurora-glass-deep rounded-2xl p-8 max-w-md w-full mx-4 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                  <ShieldX className="w-8 h-8 text-red-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
                  <p className="text-slate-400">
                    {permissionError || "You do not have permission to view this channel."}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500 mt-4">
                  <Lock className="w-4 h-4" />
                  <span>This channel is private and restricted to specific roles.</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <ChatRoom
            roomId={roomId}
            roomDetails={roomDetails}
            userId={user.id}
            userName={profile?.display_name || user.email?.split("@")[0] || "Unknown"}
            userPreferredLanguage={profile?.preferred_language || "en"}
          />
        )}
      </div>
    </ProtectedRoute>
  );
}
