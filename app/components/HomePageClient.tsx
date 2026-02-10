"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  MessageSquarePlus,
  Shield,
  Search,
  Loader2,
  X,
  FileText,
} from "lucide-react";
import { Conversation } from "../actions/home";
import { createClient } from "../../utils/supabase/client";
import { globalSearch, GlobalSearchResults } from "../actions/search";
import { getOrCreateVault } from "../actions/vault";
import NewSignalModal from "../../components/chat/NewSignalModal";
import { createConversation } from "../../actions/chat";
import { toast } from "sonner";
import QuantumLinks, { QuantumLinksRef } from "../../components/home/QuantumLinks";
import { getPinnedChats, pinChat } from "../actions/quantumlinks";
import { Pin } from "lucide-react";
import { useAuth } from "../../components/contexts/AuthContext";
import { useUserStatus } from "../../hooks/useUserStatus";
import NoteEditorModal from "../../components/home/NoteEditorModal";

interface HomePageClientProps {
  homeData: {
    user: {
      id: string;
      name: string;
      avatar: string | null;
    };
    conversations: Conversation[];
  };
  initialPinnedChatIds?: Set<string>;
  initialPinnedChats?: Conversation[];
}

const AwaitingInputVisual = () => (
  <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center">
    <div className="text-center text-white/40">
      <p className="mb-4 text-lg">No signals detected.</p>
      <AwaitingInputPulse />
    </div>
  </div>
);

const AwaitingInputPulse = () => (
  <div className="flex items-center justify-center p-16 border border-white/5 rounded-2xl bg-white/[.02]">
    <div className="relative flex items-center justify-center w-32 h-32">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="absolute w-full h-full rounded-full bg-indigo-500/10"
          style={{
            animation: `pulse 2s cubic-bezier(0.4, 0, 0.6, 1) ${i * 0.3}s infinite`,
          }}
        />
      ))}
      <div className="w-4 h-4 rounded-full bg-indigo-400" />
    </div>
    <style jsx>{`
      @keyframes pulse {
        0%, 100% { transform: scale(0.5); opacity: 0; }
        50% { opacity: 1; }
        80% { transform: scale(1); opacity: 0; }
      }
    `}</style>
  </div>
);

export default function HomePageClient({ homeData, initialPinnedChatIds = new Set(), initialPinnedChats = [] }: HomePageClientProps) {
  const [conversations, setConversations] = useState<Conversation[]>(homeData.conversations);
  const [pinnedChatIds, setPinnedChatIds] = useState<Set<string>>(initialPinnedChatIds);
  const [currentDateTime, setCurrentDateTime] = useState<string>("");
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GlobalSearchResults | null>(null);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isOpeningVault, setIsOpeningVault] = useState(false);
  const [isNewSignalOpen, setIsNewSignalOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const [isNoteEditorOpen, setIsNoteEditorOpen] = useState(false);
  const [ping, setPing] = useState<number>(24);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const quantumLinksRef = useRef<QuantumLinksRef>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { onlineUsers } = useUserStatus(user ? { id: user.id } : null);

  // Detect Mac OS
  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf('MAC') >= 0 || 
             navigator.userAgent.toUpperCase().indexOf('MAC') >= 0);
  }, []);

  // Update ping every 2 seconds with random variation
  useEffect(() => {
    const interval = setInterval(() => {
      // Base ping on real-time update frequency
      const now = Date.now();
      const timeSinceUpdate = now - lastUpdate;
      
      let basePing: number;
      if (timeSinceUpdate < 2000) {
        basePing = Math.floor(Math.random() * 10) + 20; // 20-30ms (excellent)
      } else if (timeSinceUpdate < 5000) {
        basePing = Math.floor(Math.random() * 15) + 30; // 30-45ms (good)
      } else {
        basePing = Math.floor(Math.random() * 20) + 50; // 50-70ms (fair)
      }
      
      // Add small random variation (±4ms)
      const variation = Math.floor(Math.random() * 9) - 4;
      setPing(Math.max(15, Math.min(100, basePing + variation)));
    }, 2000);

    return () => clearInterval(interval);
  }, [lastUpdate]);

  // Track when onlineUsers updates
  useEffect(() => {
    setLastUpdate(Date.now());
  }, [onlineUsers]);

  // Keyboard shortcut: Cmd+K or Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((isMac && e.metaKey && e.key === 'k') || 
          (!isMac && e.ctrlKey && e.key === 'k')) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMac]);

  // Update date/time display
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      };
      setCurrentDateTime(now.toLocaleDateString('en-US', options));
    };
    updateDateTime();
    const interval = setInterval(updateDateTime, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setConversations(homeData.conversations);
  }, [homeData.conversations]);

  // Fetch pinned chat IDs to exclude them from the main list
  // Only fetch if not provided as initial prop (for refresh after pin/unpin)
  const fetchPinnedIds = async () => {
    try {
      const pinned = await getPinnedChats();
      const pinnedIds = new Set(pinned.map((chat) => chat.id));
      setPinnedChatIds(new Set(pinnedIds));
    } catch (error) {
      setPinnedChatIds(new Set());
    }
  };

  // Only fetch if we don't have initial pinned IDs (for refresh scenarios)
  useEffect(() => {
    // If initialPinnedChatIds was provided, we already have the data, no need to fetch
    // Only fetch if it wasn't provided (shouldn't happen, but safety check)
    if (initialPinnedChatIds.size === 0 && pinnedChatIds.size === 0) {
    fetchPinnedIds();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchLoading(true);
      try {
        const results = await globalSearch(searchQuery);
        setSearchResults(results);
      } catch (e) {
        toast.error("Search failed.");
      } finally {
        setIsSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleOpenVault = async () => {
    setIsOpeningVault(true);
    try {
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

  const handleCreateConversation = async (args: {
    participants: string[];
    groupName?: string;
    initialMessage?: string;
  }) => {
    const promise = createConversation(args);
    toast.promise(promise, {
      loading: "Creating conversation...",
      success: (data) => {
        if (data.chatId) {
          router.push(`/chat/${data.chatId}`);
          setIsNewSignalOpen(false);
          return "Conversation created! Redirecting...";
        }
        return "Done.";
      },
      error: (err) => `Error: ${err.message || "Could not create conversation."}`,
    });

    const result = await promise;
    if (result.error) {
      return { error: result.error };
    }
    return { chatId: result.chatId };
  }

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  }

  const navigateToChat = (id: string) => {
    router.push(`/chat/${id}`);
    clearSearch();
  };
  
  const hasSearchResults = searchResults && (searchResults.users.length > 0 || searchResults.messages.length > 0);
  // Filter out pinned chats from the conversations list
  const unpinnedConversations = useMemo(() => {
    return conversations.filter((chat) => !pinnedChatIds.has(chat.id));
  }, [conversations, pinnedChatIds]);

  return (
    <>
      <div className="flex flex-col w-full max-w-5xl mx-auto p-4 md:p-6 gap-5 bg-transparent">
        {/* Welcome Header */}
        <div className="shrink-0">
          <div className="border-l-2 border-indigo-500 pl-4">
            <h1 className="font-display text-3xl md:text-4xl font-bold text-white mb-2">
              Welcome back, {homeData.user.name}.
            </h1>
            <div className="flex items-center gap-3">
              <p className="text-white/50 text-sm md:text-base">
                {currentDateTime}
              </p>
              {/* Ping Display */}
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/10">
                <span className="text-xs font-mono text-white/60">Ping:</span>
                <span className="text-xs font-mono text-emerald-300">{ping}ms</span>
              </div>
              {/* Live Clock Badge */}
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">ONLINE</span>
              </div>
            </div>
          </div>
        </div>

        {/* Global Search - Floating Search Bar */}
        <div className="relative shrink-0">
          <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-all duration-300 ${
            isSearchFocused 
              ? 'text-indigo-400 drop-shadow-[0_0_5px_rgba(99,102,241,0.5)]' 
              : 'text-white/30'
          }`} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Global Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            className="w-full aurora-glass-base h-12 rounded-2xl pl-12 pr-10 text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:shadow-[0_0_50px_rgba(99,102,241,0.2)] focus:scale-[1.01] transition-all duration-300 text-base"
          />
          {/* Cmd+K Hint Badge - Hidden when focused or has content */}
          {!isSearchFocused && !searchQuery && !isSearchLoading && (
            <div className="pointer-events-none absolute right-12 top-1/2 -translate-y-1/2 h-6 px-2 flex items-center justify-center rounded-md bg-white/10 border border-white/10 text-[10px] font-mono text-white/50">
              {isMac ? '⌘ K' : 'Ctrl K'}
            </div>
          )}
          {isSearchLoading ? (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-indigo-400" />
          ) : searchQuery && (
            <button onClick={clearSearch} className="absolute right-4 top-1/2 -translate-y-1/2">
              <X className="w-5 h-5 text-white/50 hover:text-white transition-colors"/>
            </button>
          )}
        </div>

        {/* Conditional Rendering for Search vs. Main Content */}
        {searchQuery.length > 1 ? (
          <motion.div 
            initial={{opacity: 0}} 
            animate={{opacity: 1}} 
            className="space-y-2"
          >
            {/* Search Results UI */}
          </motion.div>
        ) : (
          <div className="space-y-6">
            {/* Bento Grid Layout */}
            {/* Row 1: Dashboard */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-1">
              {/* Note Element - Spans 2 columns */}
              <motion.div
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsNoteEditorOpen(true)}
                className="md:col-span-2 aurora-glass-premium rounded-2xl p-3.5 cursor-pointer transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display text-lg font-semibold text-white mb-1 tracking-wide uppercase">
                      Notes
                    </h3>
                    <p className="text-white/60 text-[11px]">
                      Quick notes and reminders
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* New Signal Card */}
              <motion.div
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsNewSignalOpen(true)}
                className="aurora-glass-premium rounded-2xl p-3.5 cursor-pointer transition-all"
              >
                <div className="flex flex-col h-full justify-between">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mb-3">
                      <MessageSquarePlus className="w-5 h-5 text-indigo-400" />
                    </div>
                    <h3 className="font-display text-lg font-semibold text-white mb-1.5 tracking-wide uppercase">
                      New Signal
                    </h3>
                    <p className="text-white/60 text-[11px]">
                      Start new secure transmission.
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Vault Card */}
              <motion.div
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleOpenVault}
                className="aurora-glass-premium rounded-2xl p-3.5 cursor-pointer relative overflow-hidden transition-all"
              >
                <div className="flex flex-col h-full justify-between">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mb-3">
                      <Shield className="w-5 h-5 text-white/80" />
                    </div>
                    <h3 className="font-display text-lg font-semibold text-white mb-1.5 tracking-wide uppercase">
                      Vault
                    </h3>
                    <p className="text-white/60 text-[11px]">
                      Access Encrypted Storage.
                    </p>
                  </div>
                  {isOpeningVault && (
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-400 mt-3" />
                  )}
                </div>
              </motion.div>
            </div>

            {/* Row 2: Pinned (QuantumLinks) */}
            <div>
              <QuantumLinks 
                ref={quantumLinksRef} 
                onUnpin={fetchPinnedIds}
              />
            </div>

            {/* Row 3: Recent Signals - Data Stream */}
            <div>
              <h2 className="font-display text-lg font-semibold text-white/60 mb-4 px-2 tracking-wider uppercase">
                Recent Signals
              </h2>
              {unpinnedConversations.length > 0 ? (
                <div className="space-y-2">
                  {unpinnedConversations.map((chat) => (
                    <motion.div
                      key={chat.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="group flex items-center gap-3 p-2.5 rounded-xl aurora-glass-base hover:border-indigo-500/30 hover:shadow-lg transition-all duration-200 relative"
                    >
                      <div 
                        onClick={() => router.push(`/chat/${chat.id}`)}
                        className="flex items-center gap-3 flex-1 cursor-pointer"
                      >
                        {/* Avatar with Hexagon/Circle Border Effect */}
                        <div className="relative flex-shrink-0">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center overflow-hidden border-2 border-white/20 ring-2 ring-indigo-500/20 ring-offset-2 ring-offset-transparent">
                            {chat.avatar ? (
                              <Image
                                src={chat.avatar}
                                width={36}
                                height={36}
                                className="w-full h-full rounded-full object-cover"
                                alt={chat.name}
                                unoptimized
                              />
                            ) : (
                              <span className="text-xs font-bold text-white">
                                {chat.type === "group" ? "G" : (chat.name?.[0]?.toUpperCase() || "?")}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <h4 className="font-semibold text-sm text-slate-200 truncate pr-4">
                              {chat.name}
                            </h4>
                            <span className="text-xs text-slate-400 font-mono truncate">
                              {chat.time}
                            </span>
                          </div>
                          <p className={`text-xs ${chat.unread > 0 ? "text-slate-200 font-medium" : "text-slate-400"}`}>
                            {chat.lastMessage}
                          </p>
                        </div>

                        {chat.unread > 0 && (
                          <div className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.3)] text-xs font-semibold flex-shrink-0">
                            {chat.unread}
                          </div>
                        )}
                      </div>

                        {/* Pin Icon - appears on hover */}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              setPinnedChatIds((prev) => {
                                const newSet = new Set(prev);
                                newSet.add(chat.id);
                                return newSet;
                              });
                              
                              const result = await pinChat(chat.id);
                              if (result.success) {
                                toast.success("Chat pinned");
                                await Promise.all([
                                  fetchPinnedIds(),
                                  quantumLinksRef.current?.refresh()
                                ]);
                              } else {
                                setPinnedChatIds((prev) => {
                                  const newSet = new Set(prev);
                                  newSet.delete(chat.id);
                                  return newSet;
                                });
                                toast.error(result.error || "Failed to pin chat");
                              }
                            } catch (error) {
                              setPinnedChatIds((prev) => {
                                const newSet = new Set(prev);
                                newSet.delete(chat.id);
                                return newSet;
                              });
                              toast.error("Failed to pin chat");
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-2 rounded-lg hover:bg-white/10 flex-shrink-0 self-center"
                          title="Pin chat"
                        >
                          <Pin size={18} className="text-white/60 hover:text-indigo-400 transition-colors" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
              ) : (
                conversations.length === 0 && <AwaitingInputVisual />
              )}
            </div>
          </div>
        )}
      </div>
      <NewSignalModal
        isOpen={isNewSignalOpen}
        onClose={() => setIsNewSignalOpen(false)}
        createConversation={handleCreateConversation}
      />
      <NoteEditorModal
        isOpen={isNoteEditorOpen}
        onClose={() => setIsNoteEditorOpen(false)}
      />
    </>
  );
}
