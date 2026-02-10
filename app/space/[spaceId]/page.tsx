"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter as useNextRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/components/contexts/AuthContext";
import { getSpaceChannels, Space } from "@/actions/spaces";
import { Hash, Mic, Plus, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { createChannel } from "@/actions/channels";

export default function SpacePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { user } = useAuth();
  const router = useNextRouter();
  const { spaceId } = use(params);
  const [space, setSpace] = useState<Space | null>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user || !spaceId) return;

    const fetchSpaceData = async () => {
      setLoading(true);
      try {
        const supabase = createClient();

        // Fetch space details
        const { data: spaceData, error: spaceError } = await supabase
          .from("spaces")
          .select("*")
          .eq("id", spaceId)
          .single();

        if (spaceError || !spaceData) {
          console.error("Space not found:", spaceError);
          toast.error("Space not found");
          router.push("/");
          return;
        }

        setSpace({
          id: spaceData.id,
          name: spaceData.name,
          avatar_url: spaceData.avatar_url,
          slug: spaceData.slug,
          is_private: spaceData.is_private,
          created_at: spaceData.created_at,
          role: "member", // Will be updated below
        });

        // Check if user is owner
        const isOwner = spaceData.owner_id === user.id;
        
        // Check user's role in space
        const { data: memberData } = await supabase
          .from("space_members")
          .select("role")
          .eq("space_id", spaceId)
          .eq("user_id", user.id)
          .maybeSingle();

        const userRole = memberData?.role || "member";
        const adminStatus = isOwner || userRole === "admin" || userRole === "owner";
        setIsAdmin(adminStatus);
        
        console.log('🔴 [SPACE PAGE] User role check:', {
          isOwner,
          userRole,
          isAdmin: adminStatus,
          spaceId,
          userId: user.id,
        });

        // Fetch channels
        const channelsResult = await getSpaceChannels(spaceId);
        if (channelsResult.channels) {
          setChannels(channelsResult.channels);
        }
      } catch (error) {
        console.error("Failed to load space:", error);
        toast.error("Failed to load space");
      } finally {
        setLoading(false);
      }
    };

    fetchSpaceData();
  }, [user, spaceId, router]);

  const handleChannelClick = (channelId: string) => {
    router.push(`/space/${spaceId}/channel/${channelId}`);
  };

  const [creatingType, setCreatingType] = useState<'text' | 'voice' | null>(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateChannel = async (type: 'text' | 'voice') => {
    console.log('🔵 [SPACE PAGE] handleCreateChannel called', { type, spaceId, isAdmin });
    
    if (!isAdmin) {
      toast.error('You do not have permission to create channels');
      return;
    }
    
    if (!spaceId) {
      toast.error('Space ID is missing');
      return;
    }
    
    setCreatingType(type);
    setNewChannelName('');
  };

  const handleCreateChannelSubmit = async (e: React.FormEvent, type: 'text' | 'voice') => {
    e.preventDefault();
    
    if (!newChannelName.trim()) {
      toast.error('Channel name cannot be empty');
      return;
    }
    
    setIsCreating(true);
    try {
      const { channelId, error } = await createChannel(spaceId, newChannelName.trim(), type);
      
      if (error) {
        toast.error(error);
      } else {
        toast.success(`${type === 'voice' ? 'Voice' : 'Text'} channel "${newChannelName.trim()}" created successfully`);
        setCreatingType(null);
        setNewChannelName('');
        // Refresh channels
        const channelsResult = await getSpaceChannels(spaceId);
        if (channelsResult.channels) {
          setChannels(channelsResult.channels);
        }
        // Navigate to the new channel if it's a text channel
        if (channelId && type === 'text') {
          router.push(`/space/${spaceId}/channel/${channelId}`);
        }
      }
    } catch (error) {
      toast.error('Failed to create channel');
      console.error('Error creating channel:', error);
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="h-full flex items-center justify-center">
          <div className="text-white/60">Loading space...</div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!space) {
    return (
      <ProtectedRoute>
        <div className="h-full flex items-center justify-center">
          <div className="text-white/60">Space not found</div>
        </div>
      </ProtectedRoute>
    );
  }

  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");
  const hasChannels = channels.length > 0;

  return (
    <ProtectedRoute>
      <div className="h-[100dvh] w-full flex">
        {/* Channel Sidebar - Always visible on space page */}
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
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                  <Hash className="w-5 h-5 text-indigo-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-white truncate">{space.name}</h2>
                <p className="text-xs text-slate-400">Space</p>
              </div>
            </div>
          </div>

          {/* Channels List */}
          <div className="flex-1 overflow-y-auto p-2">
            {/* Text Channels */}
            <div className="mb-4">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 px-3">
                <span>Text Channels</span>
                {isAdmin && (
                  <button
                    onClick={() => {
                      console.log('🔵 [SPACE PAGE] Text + button clicked');
                      handleCreateChannel('text');
                    }}
                    className="hover:text-slate-200 transition-colors p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
                    title="Create Text Channel"
                    type="button"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              {/* Create Text Channel Input */}
              {creatingType === 'text' && (
                <form 
                  onSubmit={(e) => handleCreateChannelSubmit(e, 'text')} 
                  className="px-3 mb-2"
                >
                  <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
                    <input
                      type="text"
                      value={newChannelName}
                      onChange={(e) => setNewChannelName(e.target.value)}
                      placeholder="Channel name"
                      className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-slate-500"
                      autoFocus
                      disabled={isCreating}
                    />
                    <button
                      type="submit"
                      disabled={isCreating || !newChannelName.trim()}
                      className="p-1 text-green-400 hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Create"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingType(null);
                        setNewChannelName('');
                      }}
                      disabled={isCreating}
                      className="p-1 text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </div>
                </form>
              )}
              
              {textChannels.length > 0 ? (
                <ul className="space-y-1">
                  {textChannels.map((channel) => (
                    <li key={channel.id}>
                      <button
                        onClick={() => handleChannelClick(channel.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-left hover:bg-white/5 hover:text-slate-200 text-slate-400"
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
                {isAdmin && (
                  <button
                    onClick={() => {
                      console.log('🔵 [SPACE PAGE] Voice + button clicked');
                      handleCreateChannel('voice');
                    }}
                    className="hover:text-slate-200 transition-colors p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
                    title="Create Voice Channel"
                    type="button"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              {/* Create Voice Channel Input */}
              {creatingType === 'voice' && (
                <form 
                  onSubmit={(e) => handleCreateChannelSubmit(e, 'voice')} 
                  className="px-3 mb-2"
                >
                  <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
                    <input
                      type="text"
                      value={newChannelName}
                      onChange={(e) => setNewChannelName(e.target.value)}
                      placeholder="Channel name"
                      className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-slate-500"
                      autoFocus
                      disabled={isCreating}
                    />
                    <button
                      type="submit"
                      disabled={isCreating || !newChannelName.trim()}
                      className="p-1 text-green-400 hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Create"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingType(null);
                        setNewChannelName('');
                      }}
                      disabled={isCreating}
                      className="p-1 text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </div>
                </form>
              )}
              {voiceChannels.length > 0 ? (
                <ul className="space-y-1">
                  {voiceChannels.map((channel) => (
                    <li key={channel.id}>
                      <button
                        onClick={() => handleChannelClick(channel.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-left hover:bg-white/5 hover:text-slate-200 text-slate-400"
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

        {/* Main Content Area */}
        <div className="flex-1 flex items-center justify-center bg-slate-950/50">
          {!hasChannels ? (
            <div className="text-center max-w-md mx-auto p-8">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-6">
                <MessageSquarePlus className="w-10 h-10 text-indigo-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Create your first channel</h2>
              <p className="text-slate-400 mb-6">
                Get started by creating a text or voice channel for your space.
              </p>
              {isAdmin && (
                <button
                  onClick={() => handleCreateChannel('text')}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white font-semibold transition-colors flex items-center gap-2 mx-auto"
                >
                  <Plus className="w-5 h-5" />
                  Create Channel
                </button>
              )}
            </div>
          ) : (
            <div className="text-center max-w-md mx-auto p-8">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-6">
                <Hash className="w-10 h-10 text-indigo-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Select a channel</h2>
              <p className="text-slate-400">
                Choose a channel from the sidebar to start chatting.
              </p>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
