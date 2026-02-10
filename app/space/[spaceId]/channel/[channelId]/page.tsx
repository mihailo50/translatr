"use client";

import React, { useState, useEffect, use } from "react";
import { createClient } from "../../../../../utils/supabase/client";
import ChatRoom, { RoomDetails } from "../../../../../components/chat/ChatRoom";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/components/contexts/AuthContext";
import { checkChannelPermission, getSpaceChannels, Space } from "@/actions/spaces";
import { ShieldX, Lock, Hash, Mic, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ChannelPage({ 
  params 
}: { 
  params: Promise<{ spaceId: string; channelId: string }> 
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [roomDetails, setRoomDetails] = useState<RoomDetails | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const { spaceId, channelId } = use(params);

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
      console.log("🟦 [CHANNEL PAGE] fetchData called", {
        channelId,
        spaceId,
        userId: user.id,
        timestamp: new Date().toISOString(),
      });
      
      setLoading(true);
      const supabase = createClient();

      // Fetch space details and channels
      try {
        const { data: spaceData, error: spaceError } = await supabase
          .from("spaces")
          .select("*")
          .eq("id", spaceId)
          .single();

        if (!spaceError && spaceData) {
          setSpace({
            id: spaceData.id,
            name: spaceData.name,
            avatar_url: spaceData.avatar_url,
            slug: spaceData.slug,
            is_private: spaceData.is_private,
            created_at: spaceData.created_at,
            role: "member",
          });

          // Fetch channels
          const channelsResult = await getSpaceChannels(spaceId);
          if (channelsResult.channels) {
            setChannels(channelsResult.channels);
          }
        }
      } catch (error) {
        console.error("Failed to load space:", error);
      }
      
      // Check if this is a channel - first check the channels table, then rooms table
      console.log("🟦 [CHANNEL PAGE] Checking if channel exists...");
      
      // First, check the channels table
      const { data: channelData, error: channelError } = await supabase
        .from("channels")
        .select("id, space_id, name, type")
        .eq("id", channelId)
        .maybeSingle();
      
      console.log("🟦 [CHANNEL PAGE] Channel data query result:", {
        channelData,
        channelError,
        hasChannelData: !!channelData,
      });
      
      // If channel doesn't exist in channels table, check rooms table (legacy)
      let roomData = null;
      let roomDataError = null;
      
      if (!channelData) {
        console.log("🟦 [CHANNEL PAGE] Channel not found in channels table, checking rooms table...");
        const roomResult = await supabase
          .from("rooms")
          .select("space_id, room_type")
          .eq("id", channelId)
          .maybeSingle();
        roomData = roomResult.data;
        roomDataError = roomResult.error;
      } else {
        // Channel exists, check if room exists (for text channels)
        if (channelData.type === 'text') {
          const roomResult = await supabase
            .from("rooms")
            .select("space_id, room_type")
            .eq("id", channelId)
            .maybeSingle();
          roomData = roomResult.data;
          roomDataError = roomResult.error;
        }
      }
      
      console.log("🟦 [CHANNEL PAGE] Room data query result:", {
        roomData,
        roomDataError,
        hasRoomData: !!roomData,
      });
      
      // Check if this is actually a channel or a regular room
      const isActuallyChannel = channelData || (roomData?.room_type === "channel" && roomData?.space_id);
      
      // If it's not a channel (it's a regular direct/group chat), allow access without channel checks
      if (!isActuallyChannel) {
        console.log("🟦 [CHANNEL PAGE] This is not a channel, it's a regular room - allowing access");
        setHasPermission(true);
        // Continue to load room details normally
      } else {
        // It IS a channel, so verify it exists and belongs to the space
        if (!channelData && (!roomData || roomDataError)) {
          console.log("🟦 [CHANNEL PAGE] Channel not found in channels or rooms table, showing error state");
          setRoomDetails({
            id: channelId,
            room_type: "channel" as const,
            name: "Channel not found",
            members_count: 0,
            participants: [],
          });
          setHasPermission(false);
          setPermissionError("This channel does not exist or has been deleted.");
          setLoading(false);
          return;
        }
        
        // Use channel data if available, otherwise use room data
        const actualSpaceId = channelData?.space_id || roomData?.space_id;

        // Verify the channel belongs to this space
        if (actualSpaceId !== spaceId) {
          console.log("🟦 [CHANNEL PAGE] Channel does not belong to this space", {
            actualSpaceId,
            expectedSpaceId: spaceId,
          });
          setRoomDetails({
            id: channelId,
            room_type: "channel" as const,
            name: "Channel not found",
            members_count: 0,
            participants: [],
          });
          setHasPermission(false);
          setPermissionError("This channel does not belong to this space.");
          setLoading(false);
          return;
        }
      }
      
      // For text channels, room must exist. For voice channels, we only need the channel entry
      const isChannel = isActuallyChannel;
      
      // If it's a text channel but room doesn't exist, try to find it by channel_id or create it
      if (channelData && channelData.type === 'text' && !roomData) {
        console.log("🟦 [CHANNEL PAGE] Text channel exists but room doesn't, checking by channel_id...");
        
        // First, try to find room by channel_id (for old channels created with different room ID)
        const { data: roomByChannelId } = await supabase
          .from("rooms")
          .select("id, space_id, room_type")
          .eq("channel_id", channelId)
          .maybeSingle();
        
        if (roomByChannelId) {
          console.log("🟦 [CHANNEL PAGE] Found room by channel_id:", roomByChannelId);
          roomData = roomByChannelId;
        } else {
          // Room doesn't exist, create it with the same ID as the channel
          console.log("🟦 [CHANNEL PAGE] Room not found, creating new room with channel ID...");
          const { error: createRoomError } = await supabase
            .from("rooms")
            .insert({
              id: channelId,
              name: channelData.name,
              space_id: channelData.space_id,
              room_type: 'channel',
              channel_id: channelId,
            });
          
          if (createRoomError) {
            console.error("🟦 [CHANNEL PAGE] Failed to create room:", createRoomError);
            // If insert fails due to ID conflict, try to update existing room
            if (createRoomError.code === '23505') {
              console.log("🟦 [CHANNEL PAGE] Room ID conflict, updating existing room...");
              const { data: updatedRoom } = await supabase
                .from("rooms")
                .update({
                  name: channelData.name,
                  space_id: channelData.space_id,
                  room_type: 'channel',
                  channel_id: channelId,
                })
                .eq("id", channelId)
                .select("space_id, room_type")
                .maybeSingle();
              roomData = updatedRoom;
            }
          } else {
            console.log("🟦 [CHANNEL PAGE] Room created successfully");
            roomData = {
              space_id: channelData.space_id,
              room_type: 'channel' as const,
            };
          }
        }
      }
      console.log("🟦 [CHANNEL PAGE] Room type check:", {
        isChannel,
        roomType: roomData?.room_type,
        hasSpaceId: !!roomData?.space_id,
        spaceId: roomData?.space_id,
      });
      
      // If it's a channel, check permissions. Regular rooms don't need channel permission checks.
      if (isChannel) {
        console.log("🟦 [CHANNEL PAGE] This is a channel, checking permissions...");
        const { hasAccess, error } = await checkChannelPermission(channelId, user.id);
        console.log("🟦 [CHANNEL PAGE] Permission check result:", {
          hasAccess,
          error,
        });
        setHasPermission(hasAccess);
        setPermissionError(error);
        
        if (!hasAccess) {
          console.log("🟦 [CHANNEL PAGE] Access denied, stopping load");
          setLoading(false);
          return;
        }
      }
      // If it's not a channel, hasPermission is already set to true above
      
      console.log("🟦 [CHANNEL PAGE] Fetching profile and room details...");
      const [profileResult, roomDetailsResult] = await Promise.allSettled([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        getRoomDetails(channelId, user.id),
      ]);

      console.log("🟦 [CHANNEL PAGE] Profile and room details fetched:", {
        profileStatus: profileResult.status,
        roomDetailsStatus: roomDetailsResult.status,
        roomDetails: roomDetailsResult.status === "fulfilled" ? roomDetailsResult.value : null,
      });

      if (profileResult.status === "fulfilled") {
        setProfile(profileResult.value.data);
        console.log("🟦 [CHANNEL PAGE] Profile set");
      } else {
        console.log("🟦 [CHANNEL PAGE] Profile fetch failed:", profileResult.reason);
      }

      if (roomDetailsResult.status === "fulfilled") {
        // Override room_type to "channel" and use channel name for text channels
        const channelRoomDetails = {
          ...roomDetailsResult.value,
          room_type: "channel" as const,
          name: channelData?.name || roomDetailsResult.value.name, // Use channel name if available
        };
        setRoomDetails(channelRoomDetails);
        console.log("🟦 [CHANNEL PAGE] Room details set (as channel):", channelRoomDetails);
      } else {
        console.log("🟦 [CHANNEL PAGE] Room details fetch failed:", roomDetailsResult.reason);
        setRoomDetails({
          id: channelId,
          room_type: "channel" as const,
          name: channelData?.name || "Loading...",
          members_count: 0,
          participants: [],
        });
      }
      setLoading(false);
      console.log("🟦 [CHANNEL PAGE] fetchData completed, loading set to false");
    };

    fetchData();
  }, [channelId, spaceId, user]);

  const textChannels = channels.filter((c) => c.type === 'text');
  const voiceChannels = channels.filter((c) => c.type === 'voice');

  const handleChannelClick = (id: string) => {
    router.push(`/space/${spaceId}/channel/${id}`);
  };

  if (loading || !user) {
    return (
      <ProtectedRoute>
        <div className="h-[100dvh] w-full flex items-center justify-center">
          <div className="text-white/60">Loading...</div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="h-[100dvh] w-full flex">
        {/* Channel Sidebar - Always visible */}
        {space && (
          <div className="w-64 bg-slate-900/50 border-r border-white/10 flex flex-col">
            {/* Space Header */}
            <div className="p-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                {space.avatar_url ? (
                  <img
                    src={space.avatar_url}
                    alt={space.name}
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
                    {space.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-white truncate">{space.name}</h2>
                </div>
              </div>
            </div>

            {/* Channels List */}
            <div className="flex-1 overflow-y-auto p-2">
              {/* Text Channels */}
              <div className="mb-4">
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 px-3">
                  <span>Text Channels</span>
                </div>
                {textChannels.length > 0 ? (
                  <ul className="space-y-1">
                    {textChannels.map((channel) => (
                      <li key={channel.id}>
                        <button
                          onClick={() => handleChannelClick(channel.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-left hover:bg-white/5 hover:text-slate-200 ${
                            channel.id === channelId ? 'bg-white/10 text-white' : 'text-slate-400'
                          }`}
                        >
                          <Hash className="w-4 h-4" />
                          <span className="flex-1 truncate">{channel.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 px-3 py-1.5">No text channels</p>
                )}
              </div>

              {/* Voice Channels */}
              <div>
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 px-3">
                  <span>Voice Channels</span>
                </div>
                {voiceChannels.length > 0 ? (
                  <ul className="space-y-1">
                    {voiceChannels.map((channel) => (
                      <li key={channel.id}>
                        <button
                          onClick={() => handleChannelClick(channel.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-left hover:bg-white/5 hover:text-slate-200 ${
                            channel.id === channelId ? 'bg-white/10 text-white' : 'text-slate-400'
                          }`}
                        >
                          <Mic className="w-4 h-4" />
                          <span className="flex-1 truncate">{channel.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 px-3 py-1.5">No voice channels</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col bg-slate-950/50">
          {!roomDetails ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-white/60">Loading...</div>
            </div>
          ) : hasPermission === false ? (
            <div className="h-full flex items-center justify-center">
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
              roomId={channelId}
              roomDetails={roomDetails}
              userId={user.id}
              userName={profile?.display_name || user.email?.split("@")[0] || "Unknown"}
              userPreferredLanguage={profile?.preferred_language || "en"}
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
