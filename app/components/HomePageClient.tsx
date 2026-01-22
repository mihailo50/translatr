"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  MessageSquare,
  MessageSquarePlus,
  UserPlus,
  Shield,
  Languages,
  Search,
  Loader2,
  X,
} from "lucide-react";
import { Conversation } from "../actions/home";
import { createClient } from "../../utils/supabase/client";
import { deriveKey, decryptData } from "../../utils/encryption";
import { toast } from "sonner";
import { globalSearch, GlobalSearchResults } from "../actions/search";
import { getOrCreateVault } from "../actions/vault";

interface HomePageClientProps {
  homeData: {
    user: {
      name: string;
      avatar: string | null;
    };
    conversations: Conversation[];
  };
}

export default function HomePageClient({ homeData }: HomePageClientProps) {
  const [conversations, setConversations] = useState<Conversation[]>(homeData.conversations);
  const supabase = createClient();

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GlobalSearchResults | null>(null);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Vault state
  const [isOpeningVault, setIsOpeningVault] = useState(false);

  // Sync conversations when homeData changes (e.g., on page refresh)
  useEffect(() => {
    // Ensure all conversations have _lastMessageTimestamp for proper sorting
    const syncedConversations = homeData.conversations.map((conv) => {
      // If timestamp is missing, try to infer from time string or set to 0
      const convWithTimestamp = conv as Conversation & { _lastMessageTimestamp?: number };
      if (!convWithTimestamp._lastMessageTimestamp) {
        // Try to parse time string to get approximate timestamp
        // This is a fallback - ideally the server should always provide the timestamp
        return {
          ...conv,
          _lastMessageTimestamp: 0, // Will be updated by real-time subscription
        };
      }
      return conv;
    });
    setConversations(syncedConversations);
  }, [homeData.conversations]);

  const router = useRouter();

  const handleNavigation = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    // Use Next.js router for faster navigation
    router.push(href);
  };

  // Server-side decryption helper (simplified for client)
  const decryptMessageClient = useCallback(
    async (cipher: string, iv: string, roomId: string): Promise<string> => {
      try {
        const key = await deriveKey(roomId);
        return await decryptData(cipher, iv, key);
      } catch (_e) {
        return "🔒 Encrypted message";
      }
    },
    []
  );

  // Track room IDs to avoid unnecessary re-subscriptions
  const roomIdsRef = useRef<string>("");
  const channelsRef = useRef<Array<ReturnType<typeof supabase.channel>>>([]);
  const subscribedRoomsRef = useRef<Set<string>>(new Set());

  // Set up real-time subscription for new messages
  useEffect(() => {
    let mounted = true;

    const setupRealtime = async () => {
      // Clean up previous channels first
      channelsRef.current.forEach((channel) => {
        try {
          channel.unsubscribe();
        } catch (_e) {
          // Ignore unsubscribe errors
        }
        try {
          supabase.removeChannel(channel);
        } catch (_e) {
          // Ignore removeChannel errors
        }
      });
      channelsRef.current = [];

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !mounted) return;

      // Get all room IDs the user is involved in (from current conversations)
      const currentRoomIds = new Set(conversations.map((c) => c.id));

      // Use conversations list instead of querying room_members (avoids RLS recursion)
      // Also extract room IDs from direct message room IDs
      const allRoomIds = new Set<string>(currentRoomIds);

      // Extract room IDs from direct message conversations
      conversations.forEach((conv) => {
        if (conv.id.startsWith("direct_")) {
          allRoomIds.add(conv.id);
        }
      });

      const allRoomIdsArray = Array.from(allRoomIds);
      const roomIdsStr = allRoomIdsArray.sort().join(",");

      // Only set up subscriptions if room IDs have changed
      if (roomIdsRef.current === roomIdsStr && roomIdsStr !== "") {
        return;
      }
      roomIdsRef.current = roomIdsStr;

      // Clear previous subscriptions
      subscribedRoomsRef.current.clear();

      // Store user ID for use in callback
      const userId = user.id;

      // Subscribe to ALL messages and filter client-side (more reliable)
      // This ensures we catch messages even if room membership changes
      const globalChannel = supabase
        .channel(`home-messages-global-${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
          },
          async (payload) => {
            if (!mounted) return;

            const newMessage = payload.new as {
              room_id: string;
              sender_id: string;
              id: string;
              created_at: string;
              original_text?: string;
              metadata?: {
                encrypted?: boolean;
                iv?: string;
                attachment_meta?: { type?: string; viewOnce?: boolean; name?: string };
              };
            };
            const messageRoomId = newMessage.room_id;

            // Check if this message is for a room the user is involved in
            // For direct messages, check if room ID contains user ID
            const isDirectRoom = messageRoomId.startsWith("direct_");
            let isUserInRoom = false;

            if (isDirectRoom) {
              const parts = messageRoomId.split("_");
              isUserInRoom = parts.length === 3 && (parts[1] === userId || parts[2] === userId);
            }

            // If not a direct room, assume user is involved if message was received
            // (We can't query room_members due to RLS recursion, so we'll be permissive)
            // The server-side action ensures users are added to room_members when messages are sent
            if (!isUserInRoom && !isDirectRoom) {
              // For non-direct rooms, we'll process the message anyway
              // The worst case is we show a conversation the user shouldn't see, but they can't access it due to RLS
              // This is better than missing legitimate messages
              isUserInRoom = true;
            }

            if (!isUserInRoom) {
              return; // User is not involved in this room
            }

            // Get sender profile
            const { data: senderProfile } = await supabase
              .from("profiles")
              .select("id, display_name, email, avatar_url")
              .eq("id", newMessage.sender_id)
              .single();

            // Decrypt message if needed
            let messageText = newMessage.original_text || "";
            const metadata = newMessage.metadata as
              | {
                  encrypted?: boolean;
                  iv?: string;
                  attachment_meta?: { type?: string; viewOnce?: boolean; name?: string };
                }
              | undefined;

            if (metadata?.encrypted && metadata?.iv && messageText) {
              try {
                messageText = await decryptMessageClient(
                  messageText,
                  metadata.iv || "",
                  messageRoomId
                );
              } catch (_e) {
                messageText = "🔒 Encrypted message";
              }
            } else if (!messageText || messageText.trim() === "") {
              if (metadata?.attachment_meta) {
                const attachment = metadata.attachment_meta;
                if (attachment.type === "image") {
                  messageText = attachment.viewOnce ? "📸 View once photo" : "📷 Photo";
                } else {
                  messageText = `📎 ${attachment.name || "File"}`;
                }
              } else {
                messageText = "Message";
              }
            }

            // Truncate long messages
            if (messageText.length > 50) {
              messageText = messageText.substring(0, 50) + "...";
            }

            // Format sender name
            let senderName = "You";
            if (newMessage.sender_id !== userId) {
              senderName =
                senderProfile?.display_name || senderProfile?.email?.split("@")[0] || "Someone";
            }

            // Format time
            const messageDate = new Date(newMessage.created_at);
            const now = new Date();
            const diffMs = now.getTime() - messageDate.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            let lastMessageTime = "Just now";
            if (diffMins >= 1 && diffMins < 60) {
              lastMessageTime = `${diffMins}m ago`;
            } else if (diffHours < 24) {
              lastMessageTime = `${diffHours}h ago`;
            } else if (diffDays < 7) {
              lastMessageTime = `${diffDays}d ago`;
            } else {
              lastMessageTime = messageDate.toLocaleDateString();
            }

            // Update the conversation in the list or add it if it doesn't exist
            setConversations((prev) => {
              const existingConv = prev.find((conv) => conv.id === messageRoomId);
              const newTimestamp = messageDate.getTime();

              if (existingConv) {
                // Update existing conversation - always update if timestamp is newer or equal
                const convWithTimestamp = existingConv as Conversation & {
                  _lastMessageTimestamp?: number;
                };
                const existingTimestamp = convWithTimestamp._lastMessageTimestamp || 0;

                // Always update if timestamp is newer or equal (to ensure UI stays in sync)
                if (newTimestamp >= existingTimestamp) {
                  const updated = prev.map((conv) => {
                    if (conv.id === messageRoomId) {
                      return {
                        ...conv,
                        lastMessage: `${senderName}: ${messageText}`,
                        time: lastMessageTime,
                        _lastMessageTimestamp: newTimestamp,
                      };
                    }
                    return conv;
                  });

                  // Sort by timestamp (most recent first)
                  return updated.sort((a, b) => {
                    const aConv = a as Conversation & { _lastMessageTimestamp?: number };
                    const bConv = b as Conversation & { _lastMessageTimestamp?: number };
                    const aTime = aConv._lastMessageTimestamp || 0;
                    const bTime = bConv._lastMessageTimestamp || 0;
                    return bTime - aTime; // Descending order (newest first)
                  });
                } else {
                  // Skipping older message
                }
                return prev; // No update needed
              } else {
                // Add new conversation - this happens when a message arrives for a deleted conversation

                // Get sender's avatar
                const senderAvatar =
                  senderProfile?.avatar_url ||
                  `https://picsum.photos/seed/${newMessage.sender_id}/50/50`;

                const newConv: Conversation & { _lastMessageTimestamp?: number } = {
                  id: messageRoomId,
                  name: senderName,
                  type: "direct", // Default to direct, could be enhanced to detect group
                  lastMessage: `${senderName}: ${messageText}`,
                  time: lastMessageTime,
                  avatar: senderAvatar,
                  unread: 0,
                  _lastMessageTimestamp: newTimestamp,
                };

                // Add to list and sort
                const updated = [...prev, newConv].sort((a, b) => {
                  const aConv = a as Conversation & { _lastMessageTimestamp?: number };
                  const bConv = b as Conversation & { _lastMessageTimestamp?: number };
                  const aTime = aConv._lastMessageTimestamp || 0;
                  const bTime = bConv._lastMessageTimestamp || 0;
                  return bTime - aTime; // Descending order (newest first)
                });

                return updated;
              }
            });
          }
        )
        .subscribe((status, _err) => {
          if (status === "SUBSCRIBED") {
            // Successfully subscribed
          } else {
            // Handle error states - check for errors in the err parameter
            if (_err || status === "TIMED_OUT" || status === "CLOSED") {
              // Subscription failed - will retry on next effect run
            }
          }
        });

      channelsRef.current.push(globalChannel);

      // Also set up per-room subscriptions as backup (more targeted)
      allRoomIdsArray.forEach((roomId) => {
        subscribedRoomsRef.current.add(roomId);

        const roomChannel = supabase
          .channel(`home-messages-${roomId}-${Date.now()}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
              filter: `room_id=eq.${roomId}`,
            },
            async (_payload) => {
              if (!mounted) return;
              // The global subscription will handle the update, but this confirms the subscription is working
            }
          )
          .subscribe();

        channelsRef.current.push(roomChannel);
      });
    };

    setupRealtime().catch((_error) => {
      // Silently handle setup errors - will retry on next effect run
    });

    // Polling fallback: Periodically refresh conversations to catch any missed updates
    // Optimized to use a single batched query for faster performance
    const pollInterval = setInterval(async () => {
      if (!mounted) return;
      try {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();
        if (!currentUser) return;

        // Use current conversations to get room IDs (avoids RLS recursion on room_members)
        const roomIds = conversations.map((c) => c.id);

        if (roomIds.length === 0) return;

        // Batch query: Get latest messages for ALL rooms in a single query
        // This is much faster than N individual queries
        const { data: latestMessages } = await supabase
          .from("messages")
          .select("id, room_id, sender_id, original_text, metadata, created_at")
          .in("room_id", roomIds)
          .order("created_at", { ascending: false })
          .limit(roomIds.length * 2); // Get a few extra to ensure we have latest for each room

        if (!latestMessages || latestMessages.length === 0) return;

        // Group messages by room and get the latest for each
        type LatestMessageType = NonNullable<typeof latestMessages>[number];
        const latestByRoom = new Map<string, LatestMessageType>();
        latestMessages.forEach((msg) => {
          if (!latestByRoom.has(msg.room_id)) {
            latestByRoom.set(msg.room_id, msg);
          }
        });

        // Get unique sender IDs
        const senderIds = [...new Set(Array.from(latestByRoom.values()).map((m) => m.sender_id))];

        // Batch query for sender profiles
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, email")
          .in("id", senderIds);

        const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

        // Update conversations with latest messages
        setConversations((prev) => {
          let updated = [...prev];
          let hasChanges = false;

          latestByRoom.forEach((message, roomId) => {
            const existingConv = updated.find((conv) => conv.id === roomId);
            const messageTimestamp = new Date(message.created_at).getTime();
            const existingConvWithTimestamp = existingConv as Conversation & {
              _lastMessageTimestamp?: number;
            };
            const existingTimestamp = existingConvWithTimestamp?._lastMessageTimestamp || 0;

            // Only update if this message is newer
            if (messageTimestamp > existingTimestamp) {
              hasChanges = true;

              // Decrypt and format message
              let messageText = message.original_text || "";
              const metadata = message.metadata as
                | {
                    encrypted?: boolean;
                    iv?: string;
                    attachment_meta?: { type?: string; viewOnce?: boolean; name?: string };
                  }
                | undefined;

              if (metadata?.encrypted && metadata?.iv && messageText) {
                messageText = "🔒 Encrypted message";
              } else if (!messageText || messageText.trim() === "") {
                if (metadata?.attachment_meta) {
                  const attachment = metadata.attachment_meta;
                  messageText =
                    attachment.type === "image"
                      ? attachment.viewOnce
                        ? "📸 View once photo"
                        : "📷 Photo"
                      : `📎 ${attachment.name || "File"}`;
                } else {
                  messageText = "Message";
                }
              }

              if (messageText.length > 50) {
                messageText = messageText.substring(0, 50) + "...";
              }

              const senderProfile = profileMap.get(message.sender_id);
              const senderName =
                message.sender_id === currentUser.id
                  ? "You"
                  : senderProfile?.display_name || senderProfile?.email?.split("@")[0] || "Someone";

              const messageDate = new Date(message.created_at);
              const now = new Date();
              const diffMs = now.getTime() - messageDate.getTime();
              const diffMins = Math.floor(diffMs / 60000);
              const diffHours = Math.floor(diffMs / 3600000);
              const diffDays = Math.floor(diffMs / 86400000);

              let lastMessageTime = "Just now";
              if (diffMins >= 1 && diffMins < 60) {
                lastMessageTime = `${diffMins}m ago`;
              } else if (diffHours < 24) {
                lastMessageTime = `${diffHours}h ago`;
              } else if (diffDays < 7) {
                lastMessageTime = `${diffDays}d ago`;
              } else {
                lastMessageTime = messageDate.toLocaleDateString();
              }

              if (existingConv) {
                updated = updated.map((conv) =>
                  conv.id === roomId
                    ? {
                        ...conv,
                        lastMessage: `${senderName}: ${messageText}`,
                        time: lastMessageTime,
                        _lastMessageTimestamp: messageTimestamp,
                      }
                    : conv
                );
              }
            }
          });

          if (hasChanges) {
            // Sort by timestamp
            updated.sort((a, b) => {
              const aConv = a as Conversation & { _lastMessageTimestamp?: number };
              const bConv = b as Conversation & { _lastMessageTimestamp?: number };
              const aTime = aConv._lastMessageTimestamp || 0;
              const bTime = bConv._lastMessageTimestamp || 0;
              return bTime - aTime;
            });
            return updated;
          }

          return prev;
        });
      } catch (_error) {
        // Silently handle polling errors
      }
    }, 1000); // Poll every 1 second for near-instant updates

    return () => {
      mounted = false;
      // Clean up all real-time subscriptions synchronously
      channelsRef.current.forEach((channel) => {
        try {
          channel.unsubscribe();
        } catch (_e) {
          // Ignore unsubscribe errors
        }
        try {
          supabase.removeChannel(channel);
        } catch (_e) {
          // Ignore removeChannel errors
        }
      });
      channelsRef.current = [];
      roomIdsRef.current = ""; // Reset on cleanup
      // Copy ref value to avoid stale closure warning
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const subscribedRooms = subscribedRoomsRef.current;
      subscribedRooms.clear();
      clearInterval(pollInterval); // Clear polling interval
    };
  }, [conversations, supabase, decryptMessageClient]); // Re-subscribe when conversations change

  // Handle click outside to close search dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounce search logic
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setIsSearchLoading(true);
        setIsSearchOpen(true);
        try {
          const data = await globalSearch(searchQuery);
          setSearchResults(data);
        } catch (_error) {
          // Silently handle search errors
        } finally {
          setIsSearchLoading(false);
        }
      } else {
        setSearchResults(null);
        setIsSearchOpen(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectUser = (userId: string) => {
    router.push(`/chat/${userId}`);
    setIsSearchOpen(false);
    setSearchQuery("");
  };

  const handleSelectMessage = (roomId: string) => {
    router.push(`/chat/${roomId}`);
    setIsSearchOpen(false);
    setSearchQuery("");
  };

  const handleOpenVault = async () => {
    try {
      setIsOpeningVault(true);
      const vaultId = await getOrCreateVault();
      router.push(`/chat/${vaultId}`);
    } catch (error) {
      toast.error("Unable to access Vault", {
        description: error instanceof Error ? error.message : "An error occurred",
      });
    } finally {
      setIsOpeningVault(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Section 1: Search Bar */}
      <div className="relative" ref={searchRef}>
        <div
          className={`w-full bg-white/5 border rounded-2xl p-4 flex items-center gap-3 transition-colors ${
            isSearchOpen
              ? "border-aurora-indigo/50 bg-white/10"
              : "border-white/10 hover:bg-white/10"
          }`}
        >
          <Search
            className={`flex-shrink-0 transition-colors ${isSearchOpen ? "text-aurora-indigo" : "text-white/30"}`}
            size={18}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.length >= 2 && setIsSearchOpen(true)}
            placeholder="Search messages, people..."
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/50 text-sm font-sans"
          />
          {isSearchLoading ? (
            <Loader2 className="w-4 h-4 text-aurora-indigo animate-spin flex-shrink-0" />
          ) : (
            searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setIsSearchOpen(false);
                }}
                className="text-white/30 hover:text-white flex-shrink-0"
              >
                <X size={16} />
              </button>
            )
          )}
        </div>

        {/* Search Results Dropdown */}
        {isSearchOpen && searchResults && (
          <div className="absolute top-full left-0 right-0 mt-2 glass-strong rounded-2xl border border-white/10 overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 z-50">
            <div className="max-h-[400px] overflow-y-auto scrollbar-thin">
              {/* Users Section */}
              {searchResults.users.length > 0 && (
                <div className="p-2">
                  <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider px-3 py-2">
                    People
                  </h3>
                  {searchResults.users.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleSelectUser(user.id)}
                      className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/10 transition-colors text-left group/item"
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
                        {user.avatar_url ? (
                          <Image
                            src={user.avatar_url}
                            width={32}
                            height={32}
                            className="w-full h-full object-cover"
                            alt=""
                          />
                        ) : (
                          <span className="text-xs font-bold text-white">
                            {(user.display_name?.[0] || user.email?.[0] || "?").toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white group-hover/item:text-aurora-indigo transition-colors truncate">
                          {user.display_name || "Unknown"}
                        </p>
                        <p className="text-xs text-white/40 truncate">{user.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Messages Section */}
              {searchResults.messages.length > 0 && (
                <div className="p-2 border-t border-white/5">
                  <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider px-3 py-2">
                    Messages
                  </h3>
                  {searchResults.messages.map((msg) => (
                    <button
                      key={msg.id}
                      onClick={() => handleSelectMessage(msg.room_id)}
                      className="w-full flex items-start gap-3 p-2 rounded-xl hover:bg-white/10 transition-colors text-left group/item"
                    >
                      <div className="mt-1 p-1.5 rounded-lg bg-aurora-indigo/10 text-aurora-indigo shrink-0">
                        <MessageSquare size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-xs font-semibold text-white/70 truncate pr-2">
                            {msg.sender_name}
                          </span>
                          <span className="text-[10px] text-white/30 shrink-0">
                            {new Date(msg.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-white/60 truncate group-hover/item:text-white transition-colors">
                          {msg.text}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Empty State */}
              {searchResults.users.length === 0 && searchResults.messages.length === 0 && (
                <div className="p-8 text-center text-white/40">
                  <Search size={24} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No results found</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Command Grid (4 Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-6">
        {/* Card 1: Start Chat */}
        <button
          onClick={() => router.push("/contacts")}
          className="group relative overflow-hidden p-4 rounded-2xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(99,102,241,0.1)] cursor-pointer"
        >
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30 group-hover:border-indigo-500/50 transition-colors shadow-[0_0_15px_rgba(99,102,241,0.3)]">
              <MessageSquarePlus size={28} className="text-indigo-400" />
            </div>
            <span className="font-display font-bold text-xs uppercase tracking-wider text-indigo-400">
              Start Chat
            </span>
          </div>
        </button>

        {/* Card 2: Add Contact */}
        <button
          onClick={() => router.push("/contacts?action=add")}
          className="group relative overflow-hidden p-4 rounded-2xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(16,185,129,0.1)] cursor-pointer"
        >
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-lg bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 group-hover:border-emerald-500/50 transition-colors shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              <UserPlus size={28} className="text-emerald-400" />
            </div>
            <span className="font-display font-bold text-xs uppercase tracking-wider text-emerald-400">
              Add Contact
            </span>
          </div>
        </button>

        {/* Card 3: Aether Vault */}
        <button
          onClick={handleOpenVault}
          disabled={isOpeningVault}
          className="group relative overflow-hidden p-4 rounded-2xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-lg bg-amber-500/20 flex items-center justify-center border border-amber-500/30 group-hover:border-amber-500/50 transition-colors shadow-[0_0_15px_rgba(245,158,11,0.3)]">
              {isOpeningVault ? (
                <Loader2 size={28} className="text-amber-400 animate-spin" />
              ) : (
                <Shield size={28} className="text-amber-400" />
              )}
            </div>
            <span className="font-display font-bold text-xs uppercase tracking-wider text-amber-400">
              My Vault
            </span>
          </div>
        </button>

        {/* Card 4: Live Translate */}
        <button
          onClick={() => router.push("/translate")}
          className="group relative overflow-hidden p-4 rounded-2xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(236,72,153,0.1)] cursor-pointer"
        >
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-lg bg-pink-500/20 flex items-center justify-center border border-pink-500/30 group-hover:border-pink-500/50 transition-colors shadow-[0_0_15px_rgba(236,72,153,0.3)]">
              <Languages size={28} className="text-pink-400" />
            </div>
            <span className="font-display font-bold text-xs uppercase tracking-wider text-pink-400">
              Live Translate
            </span>
          </div>
        </button>
      </div>

      {/* Section 3: Recent Signals (Conversations) */}
      <div className="mt-8">
        <h3 className="text-white/40 font-display text-sm uppercase tracking-widest mb-4 ml-1">
          Active Frequencies
        </h3>

        {conversations.length > 0 ? (
          <div className="space-y-1">
            {conversations.map((chat) => (
              <a
                key={chat.id}
                href={`/chat/${chat.id}`}
                onClick={(e) => handleNavigation(e, `/chat/${chat.id}`)}
                className="block group"
              >
                <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-all duration-200 cursor-pointer border border-transparent hover:border-white/10 relative overflow-hidden backdrop-blur-sm">
                  {/* Minimal hover effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-aurora-indigo/0 via-aurora-indigo/3 to-aurora-indigo/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  <div className="relative flex-shrink-0">
                    <Image
                      src={chat.avatar}
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-lg object-cover border border-white/10 group-hover:border-white/20 transition-colors"
                      alt={chat.name}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = `https://picsum.photos/seed/${chat.id}/50/50`;
                      }}
                    />
                  </div>

                  <div className="flex-1 min-w-0 relative z-10">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className="font-semibold text-sm text-white truncate group-hover:text-indigo-300 transition-colors flex-1 mr-2 font-sans">
                        {chat.name}
                      </h4>
                      <span className="text-xs text-white/30 font-medium whitespace-nowrap shrink-0 font-sans">
                        {chat.time}
                      </span>
                    </div>
                    <p
                      className={`text-xs truncate transition-colors font-sans ${chat.unread > 0 ? "text-white/80 font-medium" : "text-white/40 group-hover:text-white/60"}`}
                    >
                      {chat.lastMessage}
                    </p>
                  </div>

                  {chat.unread > 0 && (
                    <div className="ml-2 px-1.5 py-0.5 rounded bg-pink-500/20 border border-pink-500/30 text-[10px] font-bold text-pink-400 flex-shrink-0">
                      {chat.unread}
                    </div>
                  )}

                  <ChevronRight
                    size={14}
                    className="text-white/20 group-hover:text-white/40 transition-colors ml-1 flex-shrink-0"
                  />
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="glass p-8 rounded-xl border border-white/10 text-center">
            <div className="flex flex-col items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white/20 animate-pulse mb-3" />
              <p className="text-white/30 text-sm font-sans">Waiting for signals...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
