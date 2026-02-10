"use client";

import React, { useEffect, useState, useImperativeHandle, forwardRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Pin } from 'lucide-react';
import { Conversation } from '../../app/actions/home';
import { useRouter } from 'next/navigation';
import { getPinnedChats, unpinChat } from '../../app/actions/quantumlinks';
import { toast } from 'sonner';
import { useUserStatus } from '../../hooks/useUserStatus';
import { createClient } from '../../utils/supabase/client';

export interface QuantumLinksRef {
  refresh: () => Promise<void>;
}

interface QuantumLinksProps {
  onUnpin?: () => void;
  initialPinnedChats?: Conversation[];
}

const QuantumLinks = forwardRef<QuantumLinksRef, QuantumLinksProps>(({ onUnpin, initialPinnedChats = [] }, ref) => {
  const router = useRouter();
  const supabase = createClient();
  const [pinnedConversations, setPinnedConversations] = useState<Conversation[]>(initialPinnedChats);
  const [isLoading, setIsLoading] = useState(initialPinnedChats.length === 0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [roomMembersMap, setRoomMembersMap] = useState<Map<string, string[]>>(new Map());
  
  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getCurrentUser();
  }, [supabase]);

  // Get online users status
  const { onlineUsers } = useUserStatus(currentUserId ? { id: currentUserId } : null);

  // Fetch room members for all pinned chats
  useEffect(() => {
    const fetchRoomMembers = async () => {
      if (pinnedConversations.length === 0) return;
      
      try {
        const roomIds = pinnedConversations.map(c => c.id);
        const { data: members } = await supabase
          .from('room_members')
          .select('room_id, profile_id')
          .in('room_id', roomIds);

        if (members) {
          const membersMap = new Map<string, string[]>();
          members.forEach((rm) => {
            if (!membersMap.has(rm.room_id)) {
              membersMap.set(rm.room_id, []);
            }
            membersMap.get(rm.room_id)?.push(rm.profile_id);
          });
          setRoomMembersMap(membersMap);
        }
      } catch (error) {
        // Silently handle errors
      }
    };

    fetchRoomMembers();
  }, [pinnedConversations, supabase]);

  // Helper function to check if a chat has any online members
  const isChatOnline = useMemo(() => {
    const onlineMap = new Map<string, boolean>();
    
    pinnedConversations.forEach((chat) => {
      const members = roomMembersMap.get(chat.id) || [];
      const otherMembers = members.filter(id => id !== currentUserId);
      
      if (chat.type === 'direct') {
        // For direct chats, check if the other user is online
        const otherUserId = otherMembers[0];
        if (otherUserId) {
          const status = onlineUsers[otherUserId];
          onlineMap.set(chat.id, status === 'online' || status === 'in-call');
        } else {
          onlineMap.set(chat.id, false);
        }
      } else {
        // For group chats, check if any member is online
        const hasOnlineMember = otherMembers.some(memberId => {
          const status = onlineUsers[memberId];
          return status === 'online' || status === 'in-call';
        });
        onlineMap.set(chat.id, hasOnlineMember);
      }
    });
    
    return onlineMap;
  }, [pinnedConversations, roomMembersMap, currentUserId, onlineUsers]);

  const fetchPinnedChats = async () => {
    setIsLoading(true);
    try {
      const pinned = await getPinnedChats();
      // Create a new array to ensure React detects the state change
      setPinnedConversations([...pinned]);
    } catch (error) {
      // Silently handle errors - don't show pinned chats if fetch fails
      setPinnedConversations([]);
    } finally {
      setIsLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    refresh: fetchPinnedChats,
  }));

  useEffect(() => {
    // Only fetch if we don't have initial data (for refresh scenarios)
    if (initialPinnedChats.length === 0) {
    fetchPinnedChats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  if (isLoading) {
    return (
      <div className="my-4">
        <h3 className="text-sm font-semibold text-white/60 mb-3 px-2 tracking-wider uppercase">Pinned</h3>
        <div className="flex items-center justify-center py-8">
          <div className="text-white/40 text-sm">Loading pinned chats...</div>
        </div>
      </div>
    );
  }

  // Always show the section, even if empty, so users know where pinned chats appear
  if (pinnedConversations.length === 0) {
    return (
      <div className="my-4">
        <h3 className="text-sm font-semibold text-white/60 mb-3 px-2 tracking-wider uppercase">Pinned</h3>
        <div className="flex items-center justify-center py-8">
          <div className="text-white/40 text-sm">No pinned chats. Hover over a chat and click the pin icon to pin it.</div>
        </div>
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <div className="my-4">
      <h3 className="text-sm font-semibold text-white/60 mb-3 px-2 tracking-wider uppercase">Pinned</h3>
      <motion.div 
        className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {pinnedConversations.map((chat) => {
          const isOnline = isChatOnline.get(chat.id);
          
          return (
            <motion.div
              key={chat.id}
              variants={itemVariants}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="aurora-glass-base rounded-xl relative group cursor-pointer"
            >
              {/* Unpin Button */}
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const chatToUnpin = chat;
                  try {
                    // Optimistic update: immediately remove from pinned list for instant UI feedback
                    setPinnedConversations((prev) => prev.filter((c) => c.id !== chatToUnpin.id));
                    
                    const result = await unpinChat(chatToUnpin.id);
                    if (result.success) {
                      toast.success("Chat unpinned");
                      // Refresh the pinned chats list from server
                      await fetchPinnedChats();
                      // Notify parent to refresh pinned IDs so chat appears in main list
                      onUnpin?.();
                    } else {
                      // Revert optimistic update on error
                      await fetchPinnedChats();
                      toast.error(result.error || "Failed to unpin chat");
                    }
                  } catch (error) {
                    // Revert optimistic update on error
                    await fetchPinnedChats();
                    toast.error("Failed to unpin chat");
                  }
                }}
                className="absolute top-2 right-2 z-20 text-slate-400 group-hover:text-indigo-400 transition-colors p-1.5 rounded-md hover:bg-white/10 opacity-0 group-hover:opacity-100"
                title="Unpin chat"
              >
                <Pin size={14} className="fill-current" />
              </button>

              {/* Card Content */}
              <div 
                onClick={() => router.push(`/chat/${chat.id}`)}
                className="flex flex-col items-center justify-center p-4 gap-3"
              >
                {/* Avatar */}
                <div className="relative w-12 h-12 rounded-full border-2 border-white/20 group-hover:border-indigo-500/50 transition-all bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {/* Spinning Ring for Online Users */}
                  {isOnline && (
                    <div className="absolute inset-0 rounded-full border-2 border-emerald-400/60 spinning-ring pointer-events-none" />
                  )}
                  
                  {chat.avatar ? (
                    <Image
                      src={chat.avatar}
                      width={48}
                      height={48}
                      className="w-full h-full rounded-full object-cover"
                      alt={chat.name}
                      unoptimized
                    />
                  ) : (
                    <div className="text-lg font-bold text-white">
                      {chat.type === "group" ? "G" : (chat.name?.[0]?.toUpperCase() || "?")}
                    </div>
                  )}
                </div>

                {/* Name - Natural Text Below Avatar */}
                <h4 className="text-xs font-semibold text-slate-200 truncate w-full text-center">
                  {chat.name}
                </h4>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
});

QuantumLinks.displayName = 'QuantumLinks';

export default QuantumLinks;
