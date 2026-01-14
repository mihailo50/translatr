'use client';

import React, { useState, useEffect, useTransition, useRef, useCallback, useMemo } from 'react';
import { 
  Search, 
  UserPlus, 
  MessageSquare, 
  Users, 
  Check, 
  X, 
  Loader2,
  Clock,
  Plus
} from 'lucide-react';
import { 
  getContactsData, 
  searchUsers, 
  sendContactRequest, 
  acceptContactRequest, 
  declineContactRequest,
  getOrCreateDirectRoom,
  ContactUser 
} from '../../actions/contacts';
import { createClient } from '../../utils/supabase/client';
import { useUserStatus, UserStatus } from '../../hooks/useUserStatus';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import CreateGroupModal from '../../components/chat/CreateGroupModal';

export default function ContactsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [activeTab, setActiveTab] = useState<'friends' | 'search' | 'requests'>('friends');
  
  // Data State
  const [friends, setFriends] = useState<ContactUser[]>([]);
  const [requests, setRequests] = useState<ContactUser[]>([]);
  const [searchResults, setSearchResults] = useState<ContactUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const { onlineUsers } = useUserStatus(currentUserId ? { id: currentUserId } : null);

  const resolvePresenceStatus = useCallback((userId: string, fallback?: UserStatus): UserStatus => {
    const presence = onlineUsers[userId];
    
    // Priority: 1. Presence (most real-time), 2. Database status (fallback), 3. Offline (default)
    
    // If presence explicitly says offline, ALWAYS trust it (most real-time)
    if (presence === 'offline') {
      return 'offline';
    }
    
    // If presence exists and is not offline, use it
    if (presence && presence !== 'offline') {
      // Map invisible to offline for display
      if (presence === 'invisible') return 'offline';
      return presence;
    }
    
    // If presence has NO data (undefined/null), use database fallback status
    // This handles cases where presence hasn't synced yet but user is actually online
    if (!presence && fallback) {
      // Map database status to display status
      if (fallback === 'invisible') return 'offline';
      if (fallback === 'away') return 'online'; // Map away to online for display
      return fallback;
    }
    
    // Final fallback to offline
    return 'offline';
  }, [onlineUsers]);

  const getPresenceColor = useCallback((status: UserStatus) => {
    switch (status) {
      case 'online':
        return 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]';
      case 'busy':
      case 'dnd':
        return 'bg-red-500';
      case 'in-call':
        return 'bg-aurora-purple shadow-[0_0_8px_rgba(144,97,249,0.5)]';
      case 'invisible':
      case 'offline':
      default:
        return 'bg-slate-500';
    }
  }, []);

  const getPresenceLabel = useCallback((status: UserStatus) => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'busy':
        return 'Busy';
      case 'dnd':
        return 'Do Not Disturb';
      case 'in-call':
        return 'In a Call';
      default:
        return 'Offline';
    }
  }, []);
  
  // Refs to access current values in subscription without recreating it
  const activeTabRef = useRef(activeTab);
  const searchQueryRef = useRef(searchQuery);
  
  // Keep refs in sync
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  // Initial Load - wrapped in useCallback to ensure stable reference
  const refreshData = useCallback(async () => {
    const data = await getContactsData();
    setFriends(data.friends);
    setRequests(data.requests);
    setLoading(false);
  }, []);

  useEffect(() => {
    let channel: any = null;

    // Get current user ID and set up subscription
    const setupSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (user?.id) {
        setCurrentUserId(user.id);
      }

      await refreshData();

      if (!user) return;

      // Subscribe to changes in the contacts table where current user is involved
      channel = supabase
        .channel(`contacts-changes-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
            schema: 'public',
            table: 'contacts',
            filter: `or(user_id.eq.${user.id},contact_id.eq.${user.id})`, // Listen to both directions
          },
          (payload) => {
            // When a new request is inserted or status changes, refresh the data
            if (payload.eventType === 'INSERT') {
              const newRecord = payload.new as any;
              // If it's a pending request where current user is the receiver, show notification
              if (newRecord.status === 'pending' && newRecord.contact_id === user.id) {
                toast.info('New contact request received!');
              }
              // Refresh immediately for faster UI update
              setTimeout(() => {
                refreshData();
              }, 0);
              // Refresh search results if user is searching
              if (activeTabRef.current === 'search' && searchQueryRef.current.trim().length >= 2) {
                searchUsers(searchQueryRef.current).then(setSearchResults);
              }
            } else if (payload.eventType === 'UPDATE') {
              const updatedRecord = payload.new as any;
              const oldRecord = payload.old as any;
              
              // If status changed from pending to accepted, notify the sender
              if (oldRecord.status === 'pending' && updatedRecord.status === 'accepted') {
                // If current user is the sender (user_id), show notification
                if (updatedRecord.user_id === user.id) {
                  toast.success('Your contact request was accepted!');
                  
                  // Current user sent the request, so contact_id is the person who accepted
                  // Fetch their profile and add to friends immediately
                  const recipientId = updatedRecord.contact_id;
                  
                  supabase
                    .from('profiles')
                    .select('id, display_name, email, avatar_url, status')
                    .eq('id', recipientId)
                    .single()
                    .then(({ data: recipientProfile }) => {
                      if (recipientProfile) {
                        setFriends(currentFriends => {
                          // Check if already in friends to avoid duplicates
                          if (currentFriends.some(f => f.id === recipientProfile.id)) {
                            return currentFriends;
                          }
                          // Add the recipient to friends immediately
                          return [{
                            id: recipientProfile.id,
                            display_name: recipientProfile.display_name,
                            email: recipientProfile.email,
                            avatar_url: recipientProfile.avatar_url,
                            status: 'friends' as const,
                            profile_status: recipientProfile.status as UserStatus,
                            relationship_id: updatedRecord.id
                          }, ...currentFriends];
                        });
                      }
                    });
                } else if (updatedRecord.contact_id === user.id) {
                  // Current user accepted a request - remove from requests list immediately
                  setRequests(prev => prev.filter(req => req.relationship_id !== updatedRecord.id));
                  
                  // Fetch the sender's profile to add them to friends
                  supabase
                    .from('profiles')
                    .select('id, display_name, email, avatar_url, status')
                    .eq('id', updatedRecord.user_id)
                    .single()
                    .then(({ data: senderProfile }) => {
                      if (senderProfile) {
                        setFriends(currentFriends => {
                          // Check if already in friends to avoid duplicates
                          if (currentFriends.some(f => f.id === senderProfile.id)) {
                            return currentFriends;
                          }
                          // Add the sender to friends
                          return [{
                            id: senderProfile.id,
                            display_name: senderProfile.display_name,
                            email: senderProfile.email,
                            avatar_url: senderProfile.avatar_url,
                            status: 'friends' as const,
                            profile_status: senderProfile.status as UserStatus,
                            relationship_id: updatedRecord.id
                          }, ...currentFriends];
                        });
                      }
                    });
                }
              }
              
              // Request status changed (accepted/declined) - refresh immediately for accurate data
              // Refresh in parallel with optimistic updates for fastest possible update
              refreshData();
              
              // Refresh search results if user is searching
              if (activeTabRef.current === 'search' && searchQueryRef.current.trim().length >= 2) {
                searchUsers(searchQueryRef.current).then(setSearchResults);
              }
            } else if (payload.eventType === 'DELETE') {
              // Request was declined/removed - refresh immediately
              setTimeout(() => {
                refreshData();
              }, 0);
              // Refresh search results if user is searching
              if (activeTabRef.current === 'search' && searchQueryRef.current.trim().length >= 2) {
                searchUsers(searchQueryRef.current).then(setSearchResults);
              }
            }
          }
        )
        .subscribe();
    };

    setupSubscription();

    // Cleanup on unmount
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [refreshData, supabase]);

  // Handle Search Debounce
  useEffect(() => {
    if (activeTab !== 'search') return;
    
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        startTransition(async () => {
          const results = await searchUsers(searchQuery);
          setSearchResults(results);
        });
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, activeTab]);

  // Handle opening chat with a contact
  const handleOpenChat = async (friendId: string) => {
    startTransition(async () => {
      const result = await getOrCreateDirectRoom(friendId);
      if (result.success && result.roomId) {
        router.push(`/chat/${result.roomId}`);
      } else {
        toast.error(result.error || 'Failed to open chat');
      }
    });
  };

  // Actions
  const handleSendRequest = (userId: string) => {
    startTransition(async () => {
      const res = await sendContactRequest(userId);
      if (res.success) {
        toast.success("Friend request sent!");
        // Update local state to show 'sent' status immediately
        setSearchResults(prev => prev.map(u => u.id === userId ? { ...u, status: 'pending_sent' } : u));
      } else {
        toast.error(res.error || "Failed to send request");
      }
    });
  };

  const handleAccept = (relationshipId?: string) => {
    if (!relationshipId) return;
    startTransition(async () => {
      const res = await acceptContactRequest(relationshipId);
      if (res.success) {
        toast.success("Contact added!");
        await refreshData();
      } else {
        toast.error("Failed to accept");
      }
    });
  };

  const handleDecline = (relationshipId?: string) => {
    if (!relationshipId) return;
    startTransition(async () => {
      const res = await declineContactRequest(relationshipId);
      if (res.success) {
        toast.success("Request removed");
        await refreshData();
      } else {
        toast.error("Failed to decline");
      }
    });
  };

  return (
      <>
      <div className="h-full w-full flex flex-col bg-transparent max-w-6xl mx-auto">
        
        {/* Header with Glass Container */}
        <div className="p-4 md:p-6 sticky top-0 z-40 backdrop-blur-xl border-b border-white/5 bg-[#03030b]/80">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/70 tracking-tight mb-1">
                Contacts
              </h1>
              <p className="text-white/50 text-sm">Manage your circle.</p>
            </div>
            <button
              onClick={() => setIsCreateGroupOpen(true)}
              className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] rounded-xl px-4 py-2 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
            >
              <Users size={18} />
              <Plus size={14} className="bg-white/20 rounded-full p-0.5" />
              <span className="hidden sm:inline">Create Group</span>
            </button>
          </div>
        </div>

        {/* Glass Pill Tabs - Segmented Control */}
        <div className="px-4 md:px-6 pt-4 md:pt-6">
          <div className="bg-white/5 p-1 rounded-full border border-white/10 grid grid-cols-3 gap-1 md:flex md:w-fit mb-6 backdrop-blur-md">
            <button
              onClick={() => setActiveTab('friends')}
              className={`px-3 md:px-4 py-2.5 rounded-full text-xs md:text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${
                activeTab === 'friends' 
                  ? 'bg-indigo-500/20 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)] border border-indigo-500/30' 
                  : 'text-white/50 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className="truncate">My Contacts</span>
            </button>
            <button
              onClick={() => setActiveTab('requests')}
              className={`px-3 md:px-4 py-2.5 rounded-full text-xs md:text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${
                activeTab === 'requests' 
                  ? 'bg-indigo-500/20 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)] border border-indigo-500/30' 
                  : 'text-white/50 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className="truncate">Requests</span>
              {requests.length > 0 && (
                <span className="bg-aurora-pink text-white text-[10px] px-1.5 py-0.5 rounded-full shadow-sm flex-shrink-0">
                  {requests.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`px-3 md:px-4 py-2.5 rounded-full text-xs md:text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${
                activeTab === 'search' 
                  ? 'bg-indigo-500/20 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)] border border-indigo-500/30' 
                  : 'text-white/50 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <UserPlus size={14} className="md:w-4 md:h-4 flex-shrink-0" />
              <span className="truncate hidden sm:inline">Add Contact</span>
              <span className="truncate sm:hidden">Add</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-24 md:pb-6">

          {/* --- VIEW: SEARCH --- */}
          {activeTab === 'search' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Search Input - Liquid Glass */}
            <div className="relative group max-w-3xl mx-auto w-full">
              <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-indigo-400 group-focus-within:scale-110 transition-all duration-300" size={18} />
              <input 
                type="text"
                placeholder="Search by display name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 md:pl-12 pr-4 py-3 md:py-3.5 bg-white/[0.03] border border-white/5 rounded-2xl text-white placeholder-white/30 transition-all duration-300 focus:bg-white/[0.07] focus:border-indigo-500/40 focus:shadow-[0_0_20px_rgba(99,102,241,0.15)] focus:ring-0 focus:outline-none text-sm md:text-base"
                autoFocus
              />
              {isPending && (
                <Loader2 className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" size={18} />
              )}
            </div>

            {/* Results Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map((user, index) => (
                <div 
                  key={user.id} 
                  className="group p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 hover:shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 duration-300"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center gap-4">
                    {/* Avatar with Gradient Ring */}
                    <div className="p-[1px] rounded-full bg-gradient-to-tr from-indigo-500/50 to-purple-500/50 flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-base font-bold text-white overflow-hidden border-2 border-[#020205]">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt={user.display_name || '?'} className="w-full h-full object-cover" />
                        ) : (
                          (user.display_name?.[0] || user.email?.[0] || '?').toUpperCase()
                        )}
                      </div>
                    </div>
                    
                    {/* Text Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-medium text-white/90 group-hover:text-white truncate">{user.display_name || 'Unknown'}</h3>
                      <p className="text-xs text-white/40 group-hover:text-white/60 truncate">{user.email}</p>
                    </div>
                    
                    {/* Action Buttons */}
                    {user.status === 'none' && (
                      <button 
                        onClick={() => handleSendRequest(user.id)}
                        disabled={isPending}
                        className="p-2.5 rounded-xl bg-white/5 text-white/70 hover:bg-indigo-500 hover:text-white hover:shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-all flex-shrink-0"
                      >
                        <UserPlus size={18} />
                      </button>
                    )}
                    {user.status === 'pending_sent' && (
                      <div className="px-3 py-1.5 rounded-lg bg-white/5 text-white/50 text-xs font-medium flex items-center gap-1.5 border border-white/5 flex-shrink-0">
                        <Clock size={12} /> Sent
                      </div>
                    )}
                    {user.status === 'friends' && (
                      <div className="p-2.5 rounded-xl bg-green-500/10 text-green-400 flex-shrink-0">
                        <Check size={18} />
                      </div>
                    )}
                    {user.status === 'pending_received' && (
                       <span className="text-xs text-aurora-pink flex-shrink-0">Check Requests</span>
                    )}
                  </div>
                </div>
              ))}
              
              {searchQuery.length >= 2 && searchResults.length === 0 && !isPending && (
                <div className="col-span-full text-center py-12 text-white/40">
                  No users found matching "{searchQuery}"
                </div>
              )}
            </div>
          </div>
          )}

          {/* --- VIEW: FRIENDS --- */}
          {activeTab === 'friends' && (
          loading ? (
            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-aurora-indigo w-8 h-8"/></div>
          ) : friends.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {friends.map((friend, index) => {
                 const presenceStatus = resolvePresenceStatus(friend.id, friend.profile_status as UserStatus | undefined);

                 return (
                   <div 
                     key={friend.id} 
                     className="group p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 hover:shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 duration-300 relative"
                     style={{ animationDelay: `${index * 50}ms` }}
                   >
                      <div className="flex items-start justify-between mb-3">
                          {/* Avatar with Gradient Ring */}
                          <div className="p-[1px] rounded-full bg-gradient-to-tr from-indigo-500/50 to-purple-500/50 flex-shrink-0">
                            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-base font-bold text-white overflow-hidden border-2 border-[#020205]">
                              {friend.avatar_url ? (
                                  <img src={friend.avatar_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                  (friend.display_name?.[0] || '?').toUpperCase()
                              )}
                            </div>
                          </div>
                          <div 
                            className={`w-2.5 h-2.5 rounded-full border border-white/10 ${getPresenceColor(presenceStatus)} flex-shrink-0`} 
                            title={getPresenceLabel(presenceStatus)}
                            aria-label={`Status: ${getPresenceLabel(presenceStatus)}`}
                          />
                      </div>
                      
                      <h3 className="text-base font-medium text-white/90 group-hover:text-white truncate mb-1">{friend.display_name}</h3>
                      <p className="text-xs text-white/40 group-hover:text-white/60 truncate mb-4">{friend.email}</p>

                      <button 
                        onClick={() => handleOpenChat(friend.id)}
                        disabled={isPending}
                        className="w-full p-2.5 rounded-xl bg-white/5 text-white/70 hover:bg-indigo-500 hover:text-white hover:shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <MessageSquare size={16} />
                        Message
                      </button>
                   </div>
                 );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
              <Users size={64} className="mb-4 text-white/20" />
              <h3 className="text-xl font-bold text-white mb-2">No contacts yet</h3>
              <p className="max-w-md text-white/50 mb-6">Start building your network by searching for friends and colleagues.</p>
              <button onClick={() => setActiveTab('search')} className="text-aurora-indigo hover:underline">Find people to add</button>
            </div>
          )
          )}

          {/* --- VIEW: REQUESTS --- */}
          {activeTab === 'requests' && (
          <div className="max-w-2xl mx-auto w-full animate-in slide-in-from-right-4 duration-300">
             {requests.length > 0 ? (
                <div className="space-y-4">
                    {requests.map((req, index) => (
                        <div 
                            key={req.id} 
                            className="bg-indigo-500/[0.03] border border-indigo-500/10 p-4 rounded-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300"
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-white font-bold border border-white/10 overflow-hidden flex-shrink-0">
                                {req.avatar_url ? (
                                    <img src={req.avatar_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    (req.display_name?.[0] || '?').toUpperCase()
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-white truncate">{req.display_name}</h3>
                                <p className="text-xs text-white/50">Wants to connect</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <button 
                                    onClick={() => handleDecline(req.relationship_id)}
                                    disabled={isPending}
                                    className="bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all duration-300 rounded-xl px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <X size={18} />
                                </button>
                                <button 
                                    onClick={() => handleAccept(req.relationship_id)}
                                    disabled={isPending}
                                    className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all duration-300 rounded-xl px-6 py-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Accept
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
             ) : (
                <div className="text-center py-20 text-white/40">
                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <UserPlus size={32} className="opacity-50" />
                    </div>
                    <p>No pending requests.</p>
                </div>
             )}
          </div>
          )}
        </div>
      </div>

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        friends={friends}
      />
      </>
  );
}